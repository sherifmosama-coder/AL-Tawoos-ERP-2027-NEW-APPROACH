# 🦚 Al-Tawoos FMCG ERP — System Architecture & Technical Master Snapshot

> **Release Version**: `v3.6-reusable-row-comments-cascade-rbac`  
> **Release Date**: `2026-10-11`  
> **System Architecture**: React 18 (Vite) + Tailwind CSS + Firebase Cloud Firestore (Multi-Tab IndexedDB Cache) + OneSignal Web Push SDK v16 + i18next (RTL/LTR)  
> **Target Environment**: Food Manufacturing & Bottling (Vinegar, Tahina, Packaging Lines, Outer Cartons, Rice)  
> **Single Source of Truth (SSOT)**: `src/config/appArchitecture.js`  

---

## 📑 Table of Contents

1. [System Architecture & Component Directory](#1-system-architecture--component-directory)
2. [Authentication, User Accounts & 2-Tier RBAC](#2-authentication-user-accounts--2-tier-rbac)
3. [Scoped Permissions Matrix Engine (2D Dynamic Grid)](#3-scoped-permissions-matrix-engine-2d-dynamic-grid)
4. [Landing Page Operations Hub & Universal Default Tabs](#4-landing-page-operations-hub--universal-default-tabs)
5. [Raw Materials, Flag Taxonomy & Stockless Utilities](#5-raw-materials-flag-taxonomy--stockless-utilities)
6. [Multi-Tier Manufacturing BOM & Bulk Liquid Tanks Architecture](#6-multi-tier-manufacturing-bom--bulk-liquid-tanks-architecture)
   * 6.1 Tier 1: Intermediate Manufacturing BOM (Flag M)
   * 6.2 Tier 2: Bulk Liquid Tanks & In-Situ Transformations
   * 6.3 Tier 3: Packing & Filling BOM Matrix (Flag F)
   * 6.4 Liquid Storage Vessels & Floor Buffering (`floor_liquid_vessels`)
7. [Finished Goods Work Orders & Floor Packaging Execution](#7-finished-goods-work-orders--floor-packaging-execution)
   * 7.1 Unified 3-Subtab Workspace (`plan`, `today_prod`, `live_tracking`)
   * 7.2 Floor Staging Feasibility & Gating Engine
   * 7.3 Waiting Materials Pallet Passport Workflow (Shortage Alert & 1-Click Sync)
   * 7.4 Shift Boundary Management & Daily Closure (`production_shifts`)
   * 7.5 Thermal Pallet Sticker Generation & 2-Way Print Sync (`PalletThermalPrintModal.jsx`)
   * 7.6 Dynamic Rework SOP Process Builder & Line Library Autosave (`RWK-{LINE}-{SEQ}`)
   * 7.7 Step-Level Infinite Worker Memory (MRU), Quick Staff Inheritance & Crew Clipboard
   * 7.8 Continuous Inkjet Batch Code Calculation (`DDMMHHMM`) & Batch Range Display
8. [Universal Multi-Phase Transaction Reversal Engine](#8-universal-multi-phase-transaction-reversal-engine)
   * 8.1 Phase 1: Work Order Pallet Reversal (Liquid Tanks & Raw Materials Unroll)
   * 8.2 Phase 2: Bulk Liquid Tanks Rollback (Intermediate M-Credits & Raw R-Debits)
   * 8.3 Phase 3: Stock Transfers (TRN) & Quarantined Goods Receipts (GRN) Reversal
   * 8.4 Strict Downstream Dependency Blocker Framework (LIFO Integrity Enforcement)
9. [Finished Goods Inward (FGR) & Physical Gate Inspection](#9-finished-goods-inward-fgr--physical-gate-inspection)
10. [Faulty Finished Goods Returns & Floor Custody (RTN-FG)](#10-faulty-finished-goods-returns--floor-custody-rtn-fg)
11. [Spare Parts & Maintenance Consumption Engine (Flag X)](#11-spare-parts--maintenance-consumption-engine-flag-x)
12. [Single Source of Truth (SSOT) Inventory Engine & Dynamic Warehouse Classifier](#12-single-source-of-truth-ssot-inventory-engine--dynamic-warehouse-classifier)
   * 12.1 Universal Warehouse Classifier (`warehouseClassifier.js`)
   * 12.2 Unified Live Stock Formula (`stockResolver.jsx`)
   * 12.3 9-Stream Chronological Kardex Lifecycle
   * 12.4 Pure Procurement Quarantine (`GoodsReceipt.jsx`)
13. [Dynamic Database Inspector, Interactive ERD Graph & Backup Hub](#13-dynamic-database-inspector-interactive-erd-graph--backup-hub)
14. [Universal Data Importer & Image Compression Pipeline](#14-universal-data-importer--image-compression-pipeline)
15. [Firestore Collections Data Dictionary](#15-firestore-collections-data-dictionary)
16. [Actions Required, Notifications Hub & Warehouse Custody Rules](#16-actions-required-notifications-hub--warehouse-custody-rules)
   * 16.1 Actions Required vs. Notifications Hub
   * 16.2 Static Triggering Time Guarantee
   * 16.3 Material Transfers Custody Verification Rule
17. [OneSignal Universal Web Push Gateway & Apple iOS PWA Architecture](#17-onesignal-universal-web-push-gateway--apple-ios-pwa-architecture)
   * 17.1 Apple iOS 16.4+ Web Push & PWA Standalone Mandate
   * 17.2 OneSignal Web SDK v16 Integration & Dual Admin Token Synchronization
   * 17.3 Free-Tier Cloud Push Dispatcher (Zero Cloud Functions / Spark & Blaze Compatible)
   * 17.4 Universal Push Dispatcher & Admin Notification Control Center
18. [Firestore Performance Engineering, Quota Guardrails & Offline Cache](#18-firestore-performance-engineering-quota-guardrails--offline-cache)
   * 18.1 Write-Loop Prevention & `isAlreadySynced` Guardrails
   * 18.2 Persistent Multi-Tab IndexedDB Local Cache (`persistentLocalCache`)
   * 18.3 Decoupled Boot Migrations & On-Demand Maintenance
   * 18.4 Quota Thresholds, Daily Resets & Zero-Cost Blaze Architecture
19. [TopNavbar Live Persona Switcher & Mobile UX Polish](#19-topnavbar-live-persona-switcher--mobile-ux-polish)
20. [Finance, Accounts, Dual-Ledger & Financial Statements Architecture](#20-finance-accounts-dual-ledger--financial-statements-architecture-المالية-والحسابات-ودفتر-الأستاذ)
   * 20.1 Banknote Inventory Tracking & Egyptian Pound Denominations (200 down to 0.5)
   * 20.2 SSOT Cash Ledger Engine & Atomic Transaction Posting
   * 20.3 Zero-Sum Change Exchange Mode (فكة وتظبيط فئات)
   * 20.4 Unified Physical Safe Audit & Discrepancy Reconciliation Tool (جرد وتظبيط رصيد)
   * 20.5 Two-Tier Chart of Accounts Hierarchy & Supplier Bill AP Linkage
   * 20.6 Integrated Worker Custody (عهدة) & Salary Advance (سلفة) Ledger
   * 20.7 Official A4 Printable Cash Voucher Slip (Arabic Tafqeet, QR & Triple Signatures)
   * 20.8 Dynamic Safe Provisioning, Colors, Cashiers & Safety Ceilings
   * 20.9 Automated Double-Entry Operational Accounting Hooks (PO, GRN, Cash, Custody, Work Orders)
   * 20.10 Audit-Ready Journal Ledger, Attachment Popovers & 1-Click Reversals (`REV-`)
   * 20.11 Dual-Ledger Architecture & Discreet Administrative Unlock Protocol (`SecretLockButton`)
   * 20.12 Manual Adjustment Journal Entries & Zero-Variance Lock (`ManualJournalEntryModal`)
   * 20.13 Dual-Mode Trial Balance & Automated Diagnostic Assistant (`TrialBalanceDiagnosticModal`)
   * 20.14 Financial Statements (Income Statement, Balance Sheet, Cash Flow) & Isolated A4 Printing
   * 20.15 Universal Tab-Preserving Database Refresh Engine (`universalRefresh.js`)
   * 20.16 Future Module Financial Integration Guidelines & Double-Entry Boilerplate
21. [Inter-Safe Transfer Two-Party Handshake & Partner Statements Architecture](#21-inter-safe-transfer-two-party-handshake--partner-statements-architecture)
   * 21.1 Two-Party Custody Handshake for Vault / Safe Transfers
   * 21.2 Supplier & Client Statement of Account (`party_statements`)
   * 21.3 Taxable Documents Prioritization & ETA E-Invoicing Reconciliation Standard
22. [Dynamic Master Collections Architecture & Factory Reset Immunity](#22-dynamic-master-collections-architecture--factory-reset-master-data-immunity)
   * 22.1 SSOT Dynamic Registry (`getMasterCollectionsRegistry`)
   * 22.2 Danger Zone: "Wipe Operational Data Only" Master Immunity Lock
23. [Cross-App Reusable Row-Level Collaborative Comments & Per-Message Task Engine (v3)](#23-cross-app-reusable-row-level-collaborative-comments--per-message-task-engine-v3)
   * 23.1 Reusable Plug-and-Play Architecture (`RecordCommentAction.jsx` & `useRecordComments`)
   * 23.2 Conditional 3-Dots Action Grouping & Unread-Only Counter Badge
   * 23.3 Context Menu Dynamic Icon Inheritance & Row Action Bridge
   * 23.4 Per-Message Read Tracking & Smart Auto-Scroll (First Unread / Last Message)
   * 23.5 Inline `@FullName` Mention Chips & Message-Level Task Resolution (`تم إنجاز المهمة`)
   * 23.6 Strict Target Audience Filtering & `GlobalCommentsDrawer` ("مركز المحادثات والمهام") Access Isolation
   * 23.7 System-Wide Reusable Integration Across All 22+ Modules & Tabs
24. [Finance Dues & Installments Tracking, PO Advance Anti-Repayment & A4 Dual-Half WHT Certificates (`dues_tracking`)](#24-finance-dues--installments-tracking-po-advance-anti-repayment--a4-dual-half-wht-certificates-dues_tracking)
25. [100% Setup-Driven Financial Statements Engine, Vertical Balance Sheet & Multi-Level COA Hierarchy (`financial_statements` & `accounts`)](#25-100-setup-driven-financial-statements-engine-vertical-balance-sheet--multi-level-coa-hierarchy-financial_statements--accounts)
26. [Relational Cascade Purge & Master Data Immunity Engine (`AdminControlPanel.jsx` — `factory_reset`)](#26-relational-cascade-purge--master-data-immunity-engine-admincontrolpaneljsx--factory_reset)
27. [Universal Company Profile Single Source of Truth (SSOT) & Document Letterhead Architecture (`#system_config` & `useCompanyProfile`)](#27-universal-company-profile-single-source-of-truth-ssot--document-letterhead-architecture-system_config--usecompanyprofile)
28. [Tri-Surface Navigation Alignment Standard (Home Page, Sidebar & Top Navbar)](#28-tri-surface-navigation-alignment-standard-home-page-sidebar--top-navbar)
29. [Client Master & Dynamic Market Segmentation Architecture (`#clients` & `#client_segments`)](#29-client-master--dynamic-market-segmentation-architecture-clients--client_segments)
30. [Zero Component Header Duplication Architecture (Page Header Banner SSOT)](#30-zero-component-header-duplication-architecture-page-header-banner-ssot)
31. [Sales & Commercial Module Architecture (`sales_orders`, `loading_plan`, `price_lists`, `client_contracts`)](#31-sales--commercial-module-architecture-sales_orders-loading_plan-price_lists-client_contracts)

---

## 1. System Architecture & Component Directory

```text
fmcg-erp/
├── src/
│   ├── components/
│   │   ├── comments/
│   │   │   ├── RecordCommentAction.jsx      # Universal Reusable Row Comment Trigger & useRecordComments Hook
│   │   │   ├── CommentThreadPopover.jsx     # Floating Thread Popover with Auto-Scroll, @FullName Chips & Per-Message Task Resolution
│   │   │   ├── CommentContextMenu.jsx       # Right-Click Row Context Menu Inheriting Target Row Status Icon
│   │   │   └── GlobalCommentsDrawer.jsx     # Slide-Over Activity & Tasks Hub ("مركز المحادثات والمهام") with Strict RBAC Filtering
│   │   ├── LandingPage.jsx                  # 5-Module Central ERP Hub, Floating Utility Header & Expandable Chips
│   │   ├── TopNavbar.jsx                    # Universal Header with Preserved Tab Routing, Universal Refresh & Presence Pill
│   │   ├── TabPageHeaderBanner.jsx          # Screen Title Banner with Universal Database Refresh & Tab Customization
│   │   ├── ScopedPermissionMatrixModal.jsx   # 2D Multi-User Scoped Permissions Matrix Modal with Cascade Deselection
│   │   ├── ItemMaster.jsx                   # Compound Raw Material SKU Engine, Categories & Decoupled OB Ingest
│   │   ├── SupplierMaster.jsx               # Certified Supplier Registry & Multi-Tranche Terms
│   │   ├── CategoriesMaster.jsx             # Raw Material Classification Hierarchy (100–900 Series)
│   │   ├── FinishedProductsMaster.jsx       # Finished Goods Master, Production Lines, Barcodes & Options
│   │   ├── FGCategoriesMaster.jsx           # Finished Goods Classification & Product Grouping
│   │   ├── IntermediateBOMMaster.jsx        # Intermediate Manufacturing BOM (M-Flag Formulation, Prep Codes & QA Gates)
│   │   ├── LiquidTanksMaster.jsx            # Bulk Liquid Tanks, QA Laboratory Inspection, Stopwatch Pump & Pipe Lifting
│   │   ├── FloorLiquidStorage.jsx           # Floor Buffer Vessels, Continuous Level Monitoring & CIP Cleanout
│   │   ├── BOMRecipesMaster.jsx             # 2D Packing & Filling BOM Matrix, Coverage KPI & Audit Trail
│   │   ├── WorkOrdersMaster.jsx             # 3-Subtab Floor Work Orders, Staging Stamping, Shift Sealing & Thermal Printing
│   │   ├── PalletThermalPrintModal.jsx      # High-Fidelity 100x150mm & 100x100mm Thermal Pallet Sticker Generator
│   │   ├── FinishedGoodsInward.jsx          # Physical Gate Inspection, FGR Acceptance/Rejection & FG Custody
│   │   ├── FaultyFGReturnMaster.jsx         # Defective FG Return Logger, Floor Quarantine & Resolution (RTN-FG)
│   │   ├── ProductionPerformanceReports.jsx # Production OEE, Timeline Efficiency & Downtime Audit Analytics
│   │   ├── SparePartsConsumption.jsx        # MRO / Spare Parts Consumption Logger (X-Flag Stock Deductions)
│   │   ├── POCreation.jsx                   # Procurement Orders, Dual-Route Versioning & Non-Taxable WHT Guard
│   │   ├── GoodsReceipt.jsx                 # Quarantined Vendor Goods Receipts (GRN) & Vendor Return Notes (RTN)
│   │   ├── StockTransfers.jsx               # Multi-Warehouse TRN Orders, Custodian Verification & Pipeline Auto-Transfers
│   │   ├── StockBalances.jsx                # SSOT Master Tab, 9-Stream Unified Kardex Ledger (HH:MM:SS Precision)
│   │   ├── StockCount.jsx                   # Physical Count, Multi-Tab XLSX, Proof & Granular Reconciliation
│   │   ├── CashSafesMaster.jsx              # Physical Cash Safes, Vaults, Banknote Inventory & Custodies Ledger
│   │   ├── InterSafeTransferModal.jsx       # Dedicated Two-Party Handshake Vault Transfer Modal
│   │   ├── PartnerStatementsMaster.jsx      # Supplier & Client Statements with Tax Instrument Prioritization
│   │   ├── PartnerStatementPrintSlip.jsx    # Isolated A4 Partner Statement Print Slip with Tax Summary Ribbon
│   │   ├── ChartOfAccountsMaster.jsx        # Subtabs: Journal Ledger (Default), Trial Balance, COA Directory, Master Links
│   │   ├── FinancialStatementsMaster.jsx    # Income Statement (P&L), Balance Sheet & Cash Flow Statement
│   │   ├── ManualJournalEntryModal.jsx      # Multi-line Adjustment Journal Entry with Zero-Variance Lock & Dynamic Cost Centers
│   │   ├── TrialBalanceDiagnosticModal.jsx  # Trial Balance Imbalance Inspector & Orphaned Line Diagnostic Engine
│   │   ├── TrialBalancePrintSlip.jsx        # Dedicated Full-Screen A4 Print Slip for Trial Balance with QR & Dual Signatures
│   │   ├── FinancialStatementPrintSlip.jsx  # Dedicated Full-Screen A4 Print Slip for Financial Statements
│   │   ├── JournalVoucherPrintSlip.jsx      # Dedicated Isolated A4 Print Slip for Journal Entries (JRN / REV / MJE)
│   │   ├── CashVoucherPrintSlip.jsx         # Official A4 Printable Cash Voucher Slip with Arabic Tafqeet & QR
│   │   ├── SecretLockButton.jsx            # Discreet 2-Second Long-Press Lock Button (Statutory Tax Ledger Toggle)
│   │   ├── SecretDoorModal.jsx              # Administrative PIN Prompt Modal Connected to Firestore Security Config
│   │   ├── AttachmentViewerModal.jsx        # Full-Screen Source Documentation & Document Scanner Modal
│   │   ├── WarehouseMaster.jsx              # Warehouse & Factory Floor Location Directory with Classifications
│   │   ├── ProductionWorkersMaster.jsx      # Operator, Line Leader & Technician Roster Management
│   │   ├── UsersMaster.jsx                  # User Accounts, Roles, Module Permissions & Profile Settings
│   │   ├── SystemConfigMaster.jsx           # System Setup, Corporate Statutory Records & Custom Appearance
│   │   ├── AdminControlPanel.jsx            # User Accounts, Hierarchical Permissions with Cascade Rule, DB Inspector & ERD
│   │   ├── NotificationControlCenter.jsx    # Universal Push Dispatcher, OneSignal Cloud Sync & Live Notification Policy Hub
│   │   ├── InAppAlertToast.jsx              # 15-Second Auto-Dismissing In-App Alert Toast with Hover-Pause & Deep Link
│   │   ├── BatchRangeDisplay.jsx            # Dynamic Cartons Inkjet Range Preview & First/Last Carton Sequence Visualizer
│   │   ├── SearchableSelect.jsx             # High-Performance Searchable Select Component with Keyboard Nav & Inline Adding
│   │   ├── VariantComboBox.jsx              # Searchable Variant Selection Dropdown
│   │   ├── VariantIdentifierChip.jsx        # Visual Variant Identification Badge
│   │   ├── UIUXComponents.jsx               # Shared UI Atoms (UserAvatar, HeaderPresencePill, ModernTable, RowActions)
│   │   └── PeacockLoader.jsx                # High-Frame-Rate Rotating Light Beam SVG Peacock Loader
│   ├── config/
│   │   ├── appArchitecture.js               # Central Metadata Blueprint, Default RBAC Matrix & Financial Integration Rules
│   │   └── tabAppearanceConfig.js           # Live Firestore-Synced Tab Appearance Engine (Icons, Arabic/English Names, Palettes)
│   ├── hooks/
│   │   └── useHeaderAlerts.js               # Real-time Actions Required Queue, System Notifications & Audio-Visual Dispatcher
│   ├── utils/
│   │   ├── commentEngine.js                 # Row-Level Comment Engine, Per-Message Tasks, Read Tracking & Target Audience Guard
│   │   ├── universalRefresh.js              # Universal Database Refresh Engine with Preserved Tab & Sub-Route State
│   │   ├── dualLedgerEngine.js              # Dual-Ledger State Controller, Mode Subscriptions & Administrative Security Pin Sync
│   │   ├── cashLedgerEngine.js              # SSOT Cash Transaction Ledger, Automated Double-Entry Generator & Reversal Engine
│   │   ├── notificationEngine.js            # SSOT Action Queue, Notifications Ledger, Sound Chimes & Custody Rules
│   │   ├── oneSignalEngine.js               # OneSignal Web SDK v16 Integration, Dual Admin Sync & Cloud Push Dispatcher
│   │   ├── inkjetBatchTranslator.js         # Production Date/Time Inkjet Batch Code Formatter (DDMMHHMM)
│   │   ├── warehouseClassifier.js           # Universal Dynamic Warehouse Resolver (No Static ID Hardcoding)
│   │   ├── stockResolver.jsx                # Decoupled Multi-Warehouse SSOT Stock Engine (9-Stream Balance Equation)
│   │   ├── thermalLabelGenerator.js         # Thermal Label Formatting, SVG Barcodes & Canvas Rendering Engine
│   │   └── qrCodeGenerator.js               # Dynamic High-Speed QR Code Data URL Generator
│   ├── context/
│   │   ├── CommentContext.jsx               # Global Collaborative Comments Provider, Context Menu & Popover Coordinator
│   │   └── NotificationContext.jsx          # Themed Toast, Alert & Confirmation Dialog System
│   ├── App.jsx                              # Shell Router, Module-Bound Sidebars, Persona Switcher & Synchronous Route Boot
│   └── firebase.js                          # Multi-Tab IndexedDB Firestore SDK, Cloud Storage & Auth Helpers
```

---

## 2. Authentication, User Accounts & 2-Tier RBAC

### Primary Identifier & Authentication Key
The primary identifier across all system entities is the unique user email address (`email`), which binds Firebase Authentication to the Firestore `users` profile collection (`usr_[email_cleaned]`).

### 2-Tier Role Architecture
1. **General Admin (`general_admin`)**:
   - Master unrestricted authority across all application modules, operational actions, and administrative controls.
   - Exclusive access to the **Admin Control Panel** (`admin_panel`), database purge cascades, system factory resets, deep collection inspector, dynamic ERD topology, and unmasked financial valuations.
   - Immunity from user-level permission restrictions.
2. **Standard User (`standard`)**:
   - Granted full access by default to operational workflows (e.g. inventory viewing, work order creation, pallet registration, thermal printing, and shift closure).
   - Restricted by default from high-risk operations (e.g. transaction reversals, physical stock count reconciliation approval, starting serial adjustments, CIP cleanout resets, and historical pallet modifications).
   - Fully customizable per-user via the **Scoped Permissions Matrix Modal**.

### 3-Tier Access Control Hierarchy
- **Level 1 (Module Access Gating)**: Landing Page module cards and Top Navbar navigation are governed by `user.allowedModules`.
- **Level 2 (Tab Navigation Visibility)**: Sidebar tabs render strictly when `effectivePermissions.modules[tabId] !== false`.
- **Level 3 (Operational Actions Authority)**: Granular action triggers evaluate `effectivePermissions.actions['tabId.actionKey']`.
- **Level 4 (Sensitive Data Privacy Masking)**: Sensitive fields (`unitPrice`, `totalAmount`, `taxCardNumber`, `commercialRegister`, `openingBalance`) are masked or hidden when `effectivePermissions.sensitive[fieldKey] === false`.

---

## 3. Scoped Permissions Matrix Engine (2D Dynamic Grid) & Cascade Rule

The `ScopedPermissionMatrixModal.jsx` and `AdminControlPanel.jsx` (Hierarchical Permission Matrix sub-tab) provide unified, synchronized permission editing across the ERP.

### Trigger Points & Scoping
- **Module Level**: Clicking the Shield icon on any module card in `LandingPage.jsx` opens the matrix scoped to all tabs belonging to that module.
- **Tab Level**: Clicking the Shield icon on any sidebar tab item in `App.jsx` opens the matrix scoped strictly to that individual tab.
- **Admin Control Panel**: Full-screen hierarchical user-by-user permission matrix under `AdminControlPanel.jsx`.

### Matrix Structure
- **Columns (Top Axis)**: Filterable list of Standard Users with search and multi-select toggles. General Admins are excluded from column overrides since their permissions are immutable.
- **Rows (Left Axis)**: 3-tier expandable tree hierarchy:
  1. *Tab Navigation Visibility* (`modules[tabId]`)
  2. *Operational Actions Authority* (`actions['tabId.actionKey']`)
  3. *Field Privacy Masking* (`fields['tabId.fieldKey']`)
- **Live Cloud Synchronization**: Changes are committed atomically to `system_config/permissions` via `setDoc(..., { mergeFields: ['departmentOverrides', 'userOverrides', 'updatedAt', 'updatedBy'] })`, updating all active user sessions in real time via Firestore snapshot listeners. Supports both **Department Matrix** (`departmentOverrides`) and **Individual User Overrides** (`userOverrides`) with 3-Layer Cascade resolution (`Role Defaults → Multi-Department Union → User-Level Override`).

### Hierarchical Permission Cascade Rule (Tab Visibility $\rightarrow$ Actions & Fields)
To prevent orphaned sub-permissions when a user is denied access to a tab, a strict parent-to-child cascade rule is enforced identically in **Admin Control Panel (`AdminControlPanel.jsx`)**, **Scoped Permissions Matrix (`ScopedPermissionMatrixModal.jsx`)**, and **Runtime Session Evaluation (`App.jsx` & `appArchitecture.js`)**:
1. **Automatic Cascade Deselection on Toggle**:
   - Whenever **"Show Tab in Navigation"** (`modules[tabId]`) is deselected (`false`) for a user, all subordinate selections under that tab—every **Operational Action** (`actions['tabId.*']`) and every **Sensitive Field Visibility** (`fields['tabId.*']`)—are immediately and automatically set to `false` in `userOverrides`.
2. **UI Disabling & Visual Dimming**:
   - While `modules[tabId]` is `false`, all checkboxes for that tab's operational actions and sensitive fields are unchecked, disabled (`disabled={!isTabEnabled}`), styled with reduced opacity (`opacity-30` / `opacity-50 cursor-not-allowed`), and badged as `معطلة تلقائياً (التبويب مخفي)` (`Auto-disabled because tab is hidden`).
   - Direct attempts to toggle an action or field while its parent tab is disabled are blocked.
3. **Runtime Session Guarantee (`effectivePermissions`)**:
   - Even if legacy data in Firestore contains `true` for a child action/field under a disabled tab, `effectivePermissions` in `App.jsx` and `canAccessField` / `canAccessAction` in `src/config/appArchitecture.js` force all child actions and fields of any disabled tab (`modules[tabId] === false`) to evaluate to `false`.

### Standard Operational Action Taxonomy (v2.8)
| Module / Tab | Action Key (`act.key`) | English Label | Arabic Label | Default (Standard) |
| :--- | :--- | :--- | :--- | :--- |
| `work_orders` | `canCreate` | Assign to Plan | إدراج صنف جديد بالخطة | **Enabled** |
| `work_orders` | `canEdit` | Edit Plan Order | تعديل جدول وكميات التشغيل | **Enabled** |
| `work_orders` | `canCancel` | Cancel Work Order | إلغاء أمر التشغيل وحذف الخطة | **Enabled** |
| `work_orders` | `canRegisterPallet` | Register Floor Pallet & Passport | تسجيل واعتماد باليتات الصالة وإصدار الجواز | **Enabled** |
| `work_orders` | `canTransferFg` | Transfer Pallets to FG Warehouse | ترحيل ونقل الباليتات لمستودع التام (TRN) | **Enabled** |
| `work_orders` | `canLogScrap` | Log Floor Scrap & Rework | إثبات الهالك وتسوية التشغيل وإعادة التدوير | **Enabled** |
| `work_orders` | `canPrintPalletThermal` | Print Thermal Pallet Labels | طباعة ملصقات الباليتات الحرارية | **Enabled** |
| `work_orders` | `canCloseShift` | End Shift & Close Day | إنهاء الوردية وتوثيق الإغلاق اليومي | **Enabled** |
| `work_orders` | `canAdminModifyPallet` | Admin Modify Pallet & Crew | تعديل استثنائي لبيانات وعمالة الباليتة | *Restricted* |
| `work_orders` | `canReverse` | Reverse Pallet & Roll Back Materials | إلغاء وعكس الباليتة وفك حجز الخامات | *Restricted* |
| `goods_receipts` | `canCreate` | Create GRN / RTN | تسجيل إذن استلام / مرتجع جديد | **Enabled** |
| `goods_receipts` | `canEdit` | Edit Document | تعديل الإذن وتحديث الأرصدة | **Enabled** |
| `goods_receipts` | `canApprove` | Approve Document | اعتماد التوريد / الارتجاع المخزني | **Enabled** |
| `goods_receipts` | `canCancel` | Cancel Document | إلغاء الإذن وعكس الحركات | **Enabled** |
| `goods_receipts` | `canReverse` | Reverse Approved Receipt (LIFO) | إلغاء وعكس إذن الاستلام المعتمد (LIFO) | *Restricted* |
| `transfers` | `canCreate` | Create Transfer | إصدار طلب تحويل جديد | **Enabled** |
| `transfers` | `canVerify` | Verify Transfer | اعتماد وفحص التحويل (أمين العهدة) | **Enabled** |
| `transfers` | `canCancel` | Cancel Transfer | إلغاء إذن التحويل | **Enabled** |
| `transfers` | `canReverse` | Reverse Completed Transfer (LIFO) | إلغاء وعكس التحويل المكتمل (LIFO) | *Restricted* |
| `liquid_tanks` | `canCreate` | Register New Tank | تسجيل تانك جديد | **Enabled** |
| `liquid_tanks` | `canEdit` | Edit Tank | تعديل بيانات التانك واستبدال الصورة | **Enabled** |
| `liquid_tanks` | `canAnalyzeQA` | Record QA Analysis | تسجيل نتائج الفحص المعملي (QA) | **Enabled** |
| `liquid_tanks` | `canApproveQA` | Approve QA Verdict | اعتماد نتيجة الجودة | **Enabled** |
| `liquid_tanks` | `canStartPump` | Start Lifting Pump | بدء تشغيل طلمبة الرفع | **Enabled** |
| `liquid_tanks` | `canPauseResumePump`| Pause/Resume Lifting | إيقاف مؤقت واستئناف الرفع | **Enabled** |
| `liquid_tanks` | `canFinishPump` | Finish Lifting | تأكيد إنهاء الرفع والتفريغ بالكامل | **Enabled** |
| `liquid_tanks` | `canViewRStock` | View R-Stock | عرض أرصدة خامات التحضير (R-Items) | **Enabled** |
| `liquid_tanks` | `canSubmitHandover` | Submit Shift Handover | تسليم الوردية ومطابقة ملصق السيريال | **Enabled** |
| `liquid_tanks` | `canConfigureSerial`| Configure Starting Serial | ضبط وتعديل السيريال وترتيب الخامات | *Restricted* |
| `liquid_tanks` | `canViewAudit` | View Audit Timeline | عرض سجل الحركات والتتبع الزمني | **Enabled** |
| `liquid_tanks` | `canDelete` | Delete & Roll Back Tank | حذف السجل وعكس الحركات المخزنية | *Restricted* |
| `liquid_storage` | `canView` | View Vessels & Liquid Flow | معاينة الخزانات ومناسيب السوائل وتدفق التانكات | **Enabled** |
| `liquid_storage` | `canConfigureStorage`| Configure Storage Capacity | تعديل سعة وخزانات الصالة وتعيين الحد الأدنى | *Restricted* |
| `liquid_storage` | `canAdminOverrideTanks`| Admin Override Tank Links | تعديل استثنائي وتخصيص يدوي للتانكات المرتبطة | *Restricted* |
| `liquid_storage` | `canResetCleanout` | Perform CIP Cleanout Reset | تسجيل تفريغ وغسيل الخزان (CIP Cleanout) | *Restricted* |
| `fg_inward` | `canInspect` | Inspect Inward Pallets | فحص ومطابقة باليتات المنتج التام الواردة | **Enabled** |
| `fg_inward` | `canAccept` | Accept & Inward Pallet into Custody | اعتماد واستلام الباليتة بالعهدة المخزنية | **Enabled** |
| `fg_inward` | `canReject` | Reject & Return Pallet to Floor | رفض وإرجاع الباليتة لصالة الإنتاج | **Enabled** |
| `fg_inward` | `canExport` | Export & Print Pallet Ledger / Passports| تصدير وطباعة السجل الدائم وجواز البالتة | **Enabled** |

---

## 4. Landing Page Operations Hub & Universal Default Tabs

### 4.1 Modular Structure & Visual Design
- **Module 1: Materials & Procurement (`purchases`)**: Items Master, Suppliers, Purchase Orders (PO), Goods Receipts (GRN/RTN), Stock Transfers (TRN), Stock Balances (SSOT Kardex), Stock Counts, and Spare Parts Issues.
- **Module 2: Production & Manufacturing (`production`)**: Finished Goods Master, Intermediate BOMs (M-Flag), Bulk Liquid Tanks, Floor Liquid Storage, Packing & Filling BOMs (F-Flag), Work Orders Floor Execution, Finished Goods Inward (FGR), Faulty FG Returns (RTN-FG), and Production Performance Reports.
- **Modules 3, 4, 5 (Upcoming Operational Modules)**: Sales (`sales`), Finance (`finance`), and HR (`hr`) with status previews.
- **Floating Utility Header**: Live user switcher, language toggle (العربية $\leftrightarrow$ English), and Admin Control Panel navigation.

### 4.2 3-Tier Default Tab Routing Hierarchy
When navigating to any module, the active tab resolves via:
1. **User's Saved Preference**: Evaluates `currentUser.defaultModuleTabs[moduleId]`. If permitted for that user, it opens immediately.
2. **System Predefined Default**: If no preference is set, falls back to the module's predefined default tab.
3. **First Permitted Tab**: If neither of the above is permitted under RBAC, it routes automatically to the first visible tab accessible to the user.

---

## 5. Raw Materials, Flag Taxonomy & Stockless Utilities

### 5.1 Dynamic SKU Engine
$$\text{SKU} = [\text{Usage Prefix: } F / M / R / X] - [\text{Category Code: } 100 / 200 \dots] + [\text{Sequence Number}]$$

- **Flag F (Final Packing Component)**: Bottles, caps, labels, corrugated cartons, tape, and bulk finished liquids used in filling and packing BOMs.
- **Flag M (Made Intermediate Formulation)**: Bulk liquids produced in-house (e.g. 5% vinegar, tahina paste) that require raw material blending under an Intermediate BOM.
- **Flag R (Raw Material Input)**: Pure chemical concentrates, glacial acetic acid, sesame seeds, water, and raw additives consumed in Tier 1 formulations.
- **Flag X (Non-Production / MRO)**: Spare parts, mechanical belts, machine oils, filters, and maintenance consumables (Category 900) excluded from production recipes.
- **Stockless Utilities (`isStocklessUtility: true`)**: Continuously supplied utility resources (e.g. municipal tap water, natural gas) that bypass warehouse balances and stock ledger verification, flagged with an $\infty$ icon.

### 5.2 Opening Balance Decoupling
Opening stock balances are decoupled from vendor delivery receipts (`goods_receipts`). Initial inventory entered in `ItemMaster.jsx` writes directly to `stock_ledger` using an idempotent key (`OB-${targetCode}-${suffix}`) with `docType: 'opening_balance'`.

---

## 6. Multi-Tier Manufacturing BOM & Bulk Liquid Tanks Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│               Tier 1: Intermediate Manufacturing BOM (Flag M)          │
│               Input: Raw Ingredients (Flag R)                          │
│               Attributes: Mandatory Prep Code, QA & Serial Toggles     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Tier 2: Bulk Liquid Tanks & In-Situ Transformations            │
│         Doc: production_transformations (Decoupled from GRN)           │
│         Output: Bulk M-Item Inward to Source WH                        │
│         Outflow: Direct FIFO R-Ingredients Warehouse Deduction         │
│         Transfer: Automatic Pipeline Transfer (TRN-PIPE-*) to Floor    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Tier 3: Packing & Filling BOM Matrix (Flag F)            │
│               Input: Bulk Liquid (F) + Bottles + Caps + Cartons        │
│               Yield: Strictly 1 Large Unit (Carton = X Units)          │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Tier 1: Intermediate Manufacturing BOM (Flag M)
- **Target Output**: Strictly Flag M materials.
- **Components**: Strictly Flag R raw ingredients.
- **Preparation Code (`prepCode`)**: Unique alphanumeric identifier (e.g. `100`, `50`, `C`) designating the recipe.
- **Enforcement Toggles**: `needsQA` (requires QA lab release before pump lifting) and `needsTankSerial` (requires sequential tank numbering and photo capture).

### 6.2 Tier 2: Bulk Liquid Tanks & In-Situ Transformations
1. **Preparation**: Mixing consumes Flag R raw materials from the designated Source Warehouse (`sourceWarehouse`, e.g. `WH-01`) and records a `production_transformations` document crediting the prepared intermediate batch ($M$) in the same Source Warehouse.
2. **Lifting Pump (`canStartPump` / `canFinishPump`)**: Upon pump completion, the system auto-commits an internal stock transfer (`TRN-PIPE-*`), transferring the bulk liquid from the Source Warehouse directly into the dynamic Production Floor Warehouse (`operationalClassification === 'factory_floor'`).
3. **Shift Handover**: Shift handover captures the physical sticker photo of the next upcoming tank serial, verifying sequence integrity.

### 6.3 Tier 3: Packing & Filling BOM Matrix (Flag F)
- Standardized strictly per 1 Large Unit (Outer Carton) = $X$ Small Units ($\text{الشدة}$).
- 2D grid matrix with frozen product identifiers and horizontal component columns organized in alphanumeric code sequence.

### 6.4 Liquid Storage Vessels & Floor Buffering (`floor_liquid_vessels`)
- Real-time floor vessel buffer monitoring tracking current liquid volume against total capacity.
- Handles automated continuous tank feed, manual tank allocation overrides, and Clean-in-Place (CIP) cleanout resets (`canResetCleanout`).

---

## 7. Finished Goods Work Orders & Floor Packaging Execution

### 7.1 Unified 3-Subtab Workspace
`WorkOrdersMaster.jsx` provides a 3-subtab operational workspace:
1. **Plan Workspace (`plan`)**: Planning calendar, work order assignment, target quantities, and scheduled execution lines.
2. **Today's Production (`today_prod`)**: Floor execution dashboard, staged finished product cards, pallet passport creation, thermal label printing, break tracking, and daily shift sealing.
3. **Live Tracking (`live_tracking`)**: Real-time production velocity, hourly output histograms, downtime monitors, and worker roster attribution.

### 7.2 Floor Staging Feasibility & Gating Engine
Floor staging checks component availability in the warehouse classified as `factory_floor`. If bottles, caps, cartons, or piped liquid stocks are insufficient, the system prevents silent inventory imbalances.

### 7.3 Waiting Materials Pallet Passport Workflow
When floor inventory is insufficient for a registered pallet:
1. **Status Assignment**: The pallet is saved with status `waiting_materials`.
2. **Zero Floor Deduction**: No components or liquid allocations are deducted from floor inventory.
3. **Quarantine from Staging**: The pallet is not stamped into `staged_floor_pallets` and cannot be transferred to the Finished Goods Warehouse.
4. **Visual UI Distinction**: The pallet card renders with an amber border and a pulsing warning badge (`⚠️ خامات غير كافية / Waiting Materials`).
5. **Deficit Breakdown on Click**: Clicking the card triggers a modal detailing the exact shortage per component (e.g. required vs available on floor).
6. **1-Click Synchronous Staging**: Once warehouse transfers replenish floor stock, a single-click action (`Move to Staging & Deduct`) deducts materials and promotes the pallet to `staged` status.

### 7.4 Shift Boundary Management & Daily Closure (`production_shifts`)
- **Collection**: `production_shifts`, keyed by `SHIFT-YYYY-MM-DD`.
- **Shift Sealing**: Validates that running orders are concluded, open breaks are closed, and unprinted pallets are reviewed before sealing.
- **OEE & Metric Snapshots**: Records operational KPIs, productive runtime minutes, total breaks duration, and final carton counts.
- **Era Advance**: Successfully sealing the daily shift automatically advances the active operational date to the next scheduled production date.

### 7.5 Thermal Pallet Sticker Generation & 2-Way Print Sync (`PalletThermalPrintModal.jsx`)
- **Presets Supported**: Standard Industrial 100x150mm (4x6 in) and Compact 100x100mm (4x4 in).
- **Dynamic Elements**: High-contrast SVG barcode (Order # & Lot #), QR code deep-linking to the digital Pallet Passport (`#fg_inward?palletId=...`), production date, expiration date, SKU specs, and worker crew attribution.
- **Original vs Copy Tracking**: Automatically labels stickers as `أصل / Original` on first print and `نسخة N / Copy N` on subsequent prints, updating `printCount` across both `work_orders` and `staged_floor_pallets`.
- **Manual Print Sync**: Dedicated check button allows supervisors to manually confirm physical sticker application.

### 7.6 Dynamic Rework SOP Process Builder & Line Library Autosave
- **Bypassing Standard Static SOPs**:
  Rework orders (`isRework === true`), instantiated from defective finished goods returns (`faulty_fg_returns` / `RTN-FG`), deviate from standard production routing. The system bypasses predefined fixed SOPs and introduces a dynamic, interactive step builder during both Planning and Pallet Creation stages.
- **Minimalist Step Builder Architecture**:
  - Each rework step is minimal and focused: Step Number Badge, editable Step Name input, Delete Step button with automatic reindexing, worker assignment dropdown via `SearchableSelect`, and inline "+ New" modal for on-the-fly manual worker creation.
  - **No Mandatory Gating on Rework**: All custom rework steps carry `mandatory: false` and are classified as operational steps, guaranteeing that planning submissions and pallet approvals are never obstructed by mandatory staffing warnings.
- **Autosave to Production Line Library**:
  - Automatically captures custom rework steps and writes them to the `production_processes` collection linked to the target finished product's production line (`finished_product_categories` / `categoryKey`).
  - **Standardized Naming Schema**: `[Fault Type Tags] Product Name #Repeats` (e.g. `[غطاء تالف، تسريب] طحينة فاخرة 500 جم #1`).
  - **Sequential Line-Based Process Code**: Padded 3-digit counter incremented per production line: `RWK-{LINE_KEY}-{SEQ}` (e.g. `RWK-WHITE_O-001`, `RWK-PET_LIQ-002`).
  - **Explicit Autosave Toggle**: Provided in both Plan and Pallet modals with a prominent checkbox (`[x] Autosave to line library`, default enabled).
- **Smart Past Rework Process Inheritance**:
  - Rework orders display a filtered process dropdown that specifically prioritizes past rework SOPs matching the current order's specific fault tags and production line.
  - **Optional Crew Loading**: An explicit `[ ] Also load previous crew` checkbox lets supervisors decide whether to adopt only the step structure or also pre-fill the past worker roster.
  - **Quick Reset**: A "+ New" button instantly resets to blank custom steps.
- **Two-Way Sync Between Pallet and Parent Work Order**:
  - Pallet creation pre-fills custom steps directly from the plan order without falling back to standard production SOPs.
  - Floor edits, step additions, or crew modifications in the Pallet modal apply to the pallet passport and automatically synchronize back to the parent work order document (`stepStaffing`, `processId`, `processCode`), ensuring complete synchronization between floor reality and plan records.

### 7.7 Step-Level Infinite Worker Memory (MRU), Quick Staff Inheritance & Crew Clipboard
- **Infinite Step-Level Worker Memory (MRU)**:
  - Replaced legacy rigid groupings ("core staff" vs "manual workers") with an infinite, global Most Recently Used (MRU) memory per step.
  - Each step dynamically tracks up to 5 of its most recently assigned workers across all users in `stepWorkerMemory[stepNum]`.
  - The 6th newly assigned worker causes the least recent worker to automatically drop off the recent suggestions list.
  - Memory is persisted globally on the `production_processes` document, ensuring unified operational intelligence across shifts and devices.
- **Quick Staff Inheritance from Same-Day / Recent Orders**:
  - When configuring staffing for an SOP process that has already been executed on the same production day (or recently), the system displays an inheritance banner below the process selector.
  - Supervisors can select a source order from a filtered dropdown (referenced by product name and order number) and apply the entire crew assignment roster across all steps with a single click.
- **Universal Crew Clipboard (Copy & Paste)**:
  - Every step card features subtle `Copy` and `Paste` actions.
  - Copying a step's crew activates a persistent session clipboard displaying worker count and names.
  - Clicking `Paste` on any other step immediately appends the copied crew to that step, eliminating repetitive worker lookups on multi-station lines.

### 7.8 Continuous Inkjet Batch Code Calculation (`DDMMHHMM`) & Batch Range Display
- **Real-Time Translation Engine (`inkjetBatchTranslator.js`)**:
  - Translates production date, pallet start time, and pallet end time into continuous industrial inkjet batch codes in `DDMMHHMM` format (e.g., Day: 30, Month: 09, Time: 08:15 $\rightarrow$ `30090815`).
- **Batch Range Component (`BatchRangeDisplay.jsx`)**:
  - Visual component embedded across pallet creation modals, floor summary cards, and thermal print previews.
  - Displays the continuous execution interval (Start Batch Code $\leftrightarrow$ End Batch Code) to ensure full traceability across printing heads and bottle coding machines.

---

## 8. Universal Multi-Phase Transaction Reversal Engine

The system enforces a multi-phase reversal engine governed by strict LIFO (Last-In, First-Out) dependency blocking.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Transaction Dependency Hierarchy                │
├────────────────────────────────────────────────────────────────────────┤
│ Level 4: Finished Goods Inward (FGR) & Physical Gate Acceptance        │
│    ▲                                                                   │
│ Level 3: Work Order Pallet Passports & Floor Staging (Phase 1)         │
│    ▲                                                                   │
│ Level 2: Bulk Liquid Tanks & Pipeline Transfers (Phase 2)              │
│    ▲                                                                   │
│ Level 1: Stock Transfers (TRN) & Quarantined Goods Receipts (Phase 3)  │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Phase 1: Work Order Pallet Reversal
- **Trigger**: `work_orders.canReverse`.
- **Rollback Actions**:
  - Restores allocated bulk liquid in `floor_liquid_vessels` to feeding intermediate tanks.
  - Returns consumed packaging materials (bottles, caps, cartons) to the factory floor warehouse balance.
  - Purges the pallet passport from `staged_floor_pallets`.
  - Re-balances remaining work order carton counts atomically.

### 8.2 Phase 2: Bulk Liquid Tanks Rollback
- **Trigger**: `liquid_tanks.canDelete`.
- **Rollback Actions**:
  - Reverses the automated pipeline transfer (`TRN-PIPE-*`).
  - Restores consumed Flag R raw ingredients to the Source Warehouse (`WH-01`).
  - Purges the in-situ intermediate production credit ($M$) from `production_transformations`.
  - Audits reversal metadata with mandatory user reason and timestamp.

### 8.3 Phase 3: Stock Transfers (TRN) & Quarantined Goods Receipts (GRN) Reversal
- **Triggers**: `transfers.canReverse` and `goods_receipts.canReverse`.
- **Rollback Actions**:
  - **TRN Reversal**: Restores transferred quantities from the target warehouse back to the source warehouse.
  - **GRN Reversal**: Deducts received raw materials from warehouse balances, restores target PO pending delivery balances, and reverses financial lot valuations.

### 8.4 Strict Downstream Dependency Blocker Framework
Before reversing any transaction, the system checks downstream references:
- A Goods Receipt (GRN) **cannot be reversed** if its lots have been consumed in a liquid tank or moved in a transfer.
- A Liquid Tank **cannot be reversed** if its liquid volume has been consumed by a work order pallet.
- A Work Order Pallet **cannot be reversed** if it has already been accepted at the Finished Goods Warehouse (`fg_receipts`).
- In all blocked cases, an informative dependency modal lists every blocking downstream document ID, requiring reverse chronological rollback (LIFO).

---

## 9. Finished Goods Inward (FGR) & Physical Gate Inspection

Component: `src/components/FinishedGoodsInward.jsx`
- **Gate Inspection**: Quality and packaging verification of pallets arriving from the production floor.
- **Acceptance (`canAccept`)**: Issues an official Finished Goods Receipt (`FGR-*`), removing the pallet from the production floor staging area and placing it into official finished goods warehouse custody.
- **Rejection (`canReject`)**: Flags the pallet as rejected with a documented defect reason and returns it to the production floor roster.
- **Digital Passport Viewer (`canExport`)**: Scans QR codes from thermal stickers to retrieve real-time batch history, worker rosters, and tank origins.

---

## 10. Faulty Finished Goods Returns & Floor Custody (RTN-FG)

Component: `src/components/FaultyFGReturnMaster.jsx`
- **Return Vouchers (`RTN-*`)**: Logs defective finished goods returned from trade or warehouse handling.
- **Floor Custody Confirmation (`canConfirm`)**: Transfers physical custody of defective goods to the production floor quarantine buffer.
- **Resolution (`canResolve`)**: Resolves returned stock via rework blending, repacking, or supervised scrap logging.
- **Thermal Labeling (`canPrint`)**: Prints red quarantine identifiers for returned pallet stacks.

---

## 11. Spare Parts & Maintenance Consumption Engine (Flag X)

Component: `src/components/SparePartsConsumption.jsx`
- **Category Isolation**: Restricted strictly to Category 900 items carrying Flag X.
- **Direct Ledger Deductions**: Logs outward consumption vouchers directly to `stock_ledger` (`action: 'spare_parts_consumption'`), which are immediately reflected in `buildLiveStockMatrix` and the Unified Kardex under tag `XISS`.

---

## 12. Single Source of Truth (SSOT) Inventory Engine & Dynamic Warehouse Classifier

### 12.1 Universal Warehouse Classifier (`warehouseClassifier.js`)
Eliminates hardcoded warehouse IDs across the codebase by exporting dynamic classification helpers:
- `getFactoryFloorWarehouse(warehouses)`: Dynamically resolves the warehouse record where `operationalClassification === 'factory_floor'` or `isFactoryLinked === true`.
- `getRawStorageWarehouses(warehouses)`: Returns warehouses designated for raw materials storage.
- `getQuarantineWarehouses(warehouses)`: Returns warehouses classified as returns, scrap, or quarantine (excluded from usable stock calculations).
- `isUsableWarehouse(wh)`: Returns true only if the warehouse holds active, usable inventory.

### 12.2 Unified Live Stock Formula (`stockResolver.jsx`)
For any Item-Variant in a specific Warehouse:
$$\text{Available Stock} = \sum \text{GRN} - \sum \text{RTN} + \sum \text{OB} \pm \sum \text{TRN} \pm \sum \text{ADJ} + \sum \text{M Produced} - \sum \text{R Consumed} - \sum \text{XISS} - \sum \text{MO Consumed}$$

Usable stock calculations automatically exclude quarantine, scrap, and returns locations.

### 12.3 9-Stream Chronological Kardex Lifecycle
`StockBalances.jsx` operates as the single authoritative inventory ledger, tracking movements with HH:MM:SS precision:

| Stream Tag | Transaction Description | Color Badge | Flow Effect |
| :--- | :--- | :--- | :--- |
| `OB` | Initial Baseline Stock Opening Balance | Teal | **+ In** |
| `GRN` | Vendor Inward Goods Delivery | Emerald | **+ In** |
| `RTN` | Vendor Non-Compliant Material Return | Rose | **- Out** |
| `TRN` | Internal Multi-Warehouse Movement | Indigo | **⇄ Transfer** |
| `PIPE` | Overhead Pipeline Liquid Transfer | Sky Blue | **⇄ Transfer** |
| `PRD-INT` | Bulk Intermediate Liquid Tank Preparation | Blue | **+ In / - Out** |
| `ISS` | Work Order Floor Packaging Material Issue | Amber | **- Out** |
| `XISS` | Machine Spare Parts & Maintenance Issue | Fuchsia | **- Out** |
| `ADJ` | Physical Count Reconciliation (Surplus/Deficit)| Purple | **± Reconcile** |

### 12.4 Pure Procurement Quarantine (`GoodsReceipt.jsx`)
The `goods_receipts` tab and collection are quarantined to external vendor transactions (GRN and RTN). Opening balances and internal stock count adjustments are excluded from vendor account views, keeping billing and payment tranches accurate.

---

## 13. Dynamic Database Inspector, Interactive ERD Graph & Backup Hub

Component: `src/components/AdminControlPanel.jsx`
- **Client-Side Scanner**: Probes active collections across metadata blueprints, system configs, and operational transactions with zero backend dependencies.
- **Interactive 3-Tier ERD Graph**: Renders relationship links across three distinct flow columns (Upstream $\rightarrow$ Center Node $\rightarrow$ Downstream) using foreign key heuristics.
- **Chunked Backup & Restore**: Exports selective JSON backups and supports chunked transactions (400 document writes per batch) with clean slate or merge/upsert restore strategies.

---

## 14. Universal Data Importer & Image Compression Pipeline

- **Pre-Import Data Validation Engine**: Classifies spreadsheet rows as Valid, Warning, or Error with 1-click auto-fix rules for delivery terms and shelf-life calculations.
- **HTML5 Canvas Compression**: Compresses uploaded photos to a maximum dimension of 800–1600px JPEG (quality: 0.70–0.75), keeping file sizes under 80KB to maintain Firestore document efficiency.
- **PDF Rasterizer**: Converts multi-page documents (up to 6 pages) into optimized image formats for responsive viewing.

---

## 15. Firestore Collections Data Dictionary

| Collection Name | Document ID Pattern | Description |
| :--- | :--- | :--- |
| `users` | `usr_[email_cleaned]` | User accounts with 2-tier roles, module arrays, and `defaultModuleTabs` preferences |
| `warehouses` | `WH-01`, `WH-FLOOR` | Multi-warehouse master with operational classifications (`factory_floor`, `raw_materials`, `returns`) |
| `items` | `F-101`, `R-301`, `X-801` | Raw materials catalog, compound SKUs, stockless utilities, and vendor variations |
| `categories` | `100`, `200`, `300` | Raw material coding series (100 to 900+) |
| `finished_products` | `FG-101`, `FG-202` | Finished goods specifications, packaging ratios, and production line bindings |
| `finished_product_categories` | Slug / Code | Finished goods categories and product family groups |
| `intermediate_recipes` | `IBOM-R301-V1` | Intermediate manufacturing formulations (M-flag output from R-flag inputs) |
| `bom_recipes` | `BOM-FG101-GEN` | Packing & filling BOM recipes per 1 carton yield with component audit trails |
| `production_processes` | `Proc.XXX`, `SOP-XXX`, `RWK-{LINE}-{SEQ}` | Standard production SOPs & dynamic rework processes with step-level MRU memory and line library links |
| `liquid_tanks` | `TANK-[Timestamp]-[Serial]` | Bulk liquid tanks, QA results, stopwatch pump timers, and lifting state |
| `floor_liquid_vessels` | `VESSEL-[Code]` | Production floor buffer tanks, continuous levels, and active feeding tank allocations |
| `work_orders` | `MO-YYYYMMDD-XX` | Floor work orders, scheduled quantities, priorities, and pallet passports |
| `staged_floor_pallets` | `PAL-MO-...-PXX` | Staged pallets on the factory floor awaiting transfer to the Finished Goods Warehouse |
| `production_shifts` | `SHIFT-YYYY-MM-DD` | Daily shift closure records, break logs, OEE efficiency snapshots, and sealing audits |
| `fg_receipts` | `FGR-YYYYMMDD-XX` | Finished Goods Inward receipts stamped upon physical gate acceptance |
| `faulty_fg_returns` | `RTN-YYYYMMDD-XX` | Defective finished goods returned from trade or internal handling |
| `departments` | `DEPT-XXXX` | Organizational departments (`code`, `nameAr`, `nameEn`, `headEmployeeId`, `color`, `isActive`) powering multi-department permissions and future HR/routing |
| `employees` | `EMP-XXXX` | Unified HR-ready staff, workers, and system users directory (`departmentIds[]`, `operationalTags[]`, `isSystemUser`, `linkedUserId`, `hrProfile`) — canonical SSOT replacing legacy `production_workers` |
| `production_transformations`| `TRANS-TANK-*`, `TRANS-WO-*`| In-situ production transactions (M-credits, R-deductions, and WO component issues) |
| `shift_handovers` | `SH-[Timestamp]-[Serial]` | Shift handover logs and physical serial sticker verification audits |
| `spare_parts_issues` | `XISS-YYYYMMDD-01` | Non-production spare parts & consumables issue vouchers |
| `suppliers` | `SUP-101`, `SUP-102` | Certified vendors, statutory tax files, and multi-tranche credit terms |
| `purchase_orders` | `PO-YYYYMMDD-XX` | Procurement orders with dual-route revision history |
| `goods_receipts` | `GRN-...`, `RTN-...` | Quarantined vendor delivery receipts and supplier return notes |
| `stock_transfers` | `TRN-...`, `TRN-PIPE-...` | Inter-warehouse transfers and automatic pipeline liquid transfer vouchers |
| `stock_counts` | `STK-YYYYMMDD-XX` | Physical inventory audit sessions, snapshots, proof, and line audit history |
| `stock_ledger` | `OB-...`, Auto-ID | Immutable stock movement ledger (FIFO lots, opening balances, and consumption logs) |
| `system_config` | `permissions`, `app_architecture` | Central RBAC overrides, starting serials, and system architecture metadata |
| `user_actions_queue` | `${actionType}_${docId}` | Idempotent pending actions queue requiring verification or approval per user/role |
| `system_notifications` | `notif_[timestamp]_[rand]` | Broadcast and direct system notifications with per-user `readBy` array tracking |

---

## 16. Actions Required, Notifications Hub & Warehouse Custody Rules

### 16.1 Actions Required vs. Notifications Hub
* **Actions Required (`user_actions_queue`)**: Holds pending workflow transactions requiring an explicit user action/approval (e.g. PO approval, Stock Transfer verification, Faulty FG floor acceptance, Liquid Tank QA).
  * Has floating counter badge on top navbar.
  * Clicking an action navigates directly to the target module, tab, and flashes the target document row.
  * Completing the action marks it as `completed` and decrements badge count.
  * **Strict Initiator Exclusion**: The user who triggered the transaction never receives an action required for their own step unless they are General Admin.
* **Notifications Hub (`system_notifications`)**: Informational updates and success/warning receipts (e.g. "Your PO has been approved", "Stock transfer received").
  * Marked as read individually on click or in bulk via "Mark All as Read".
* **Real-time Arrival Alerts**:
  * **In-App Toast**: 15-second auto-dismissing banner with progress countdown bar and hover-pause.
  * **Outside ERP (PC / Mac / Mobile)**: OS-level Web Notifications API and background Service Worker when ERP is minimized, tab hidden, or device is offline.

### 16.2 Static Triggering Time Guarantee
* **Immutable Snapshot**: The timestamp beside an action or notification represents a frozen snapshot of the exact moment the event was triggered (`hh:mm A` for today's items, or `DD/MM hh:mm A` for earlier dates).
* **Overwrite Protection**: `createActionRequired` never overwrites `createdAt` on repeated sync passes, page refreshes, or boot `backfillPendingActions` scans. Existing records preserve their original timestamp permanently.

### 16.3 Material Transfers Custody Verification Rule
* **Custody Mandate**: Any stock/material transfer moving items to or from a warehouse **always requires verification and approval by the user responsible for that warehouse (`responsibleUserId`)**, **unless** the triggerer user is General Admin (`isGeneralAdmin`).
* **Inter-Custody Handshake**:
  * **Source Custodian Dispatches**: When the source warehouse custodian creates the transfer, the recipient warehouse custodian (`targetCustodianId`) must inspect and verify receipt.
  * **Target Custodian Pulls/Requests**: When the target warehouse custodian creates the transfer, the source warehouse custodian (`sourceCustodianId`) must inspect and verify dispatch.
  * **External Triggerer**: When an operator, planner, or supervisor triggers a transfer between warehouses, the assigned warehouse custodians (and General Admin) are targeted.
  * **Self-Approval Prohibited**: A non-admin user can NEVER verify their own transfer (`currentUserId !== trn.issuedById`).
  * **Direct Completion**: Occurs exclusively when the triggerer is General Admin, or when a user is custodian of both source and target warehouses and executes a transfer within their own custody on today's date.

---

## 17. OneSignal Universal Web Push Gateway & Apple iOS PWA Architecture

Component: `src/components/NotificationControlCenter.jsx`  
Core Engine: `src/utils/oneSignalEngine.js`  
Service Worker: `public/OneSignalSDKWorker.js`

### 17.1 Apple iOS 16.4+ Web Push & PWA Standalone Mandate
Apple iOS enforces a strict security sandbox on Web Push notifications:
* **Standalone PWA Requirement**: On iOS (iPhone & iPad), Safari disables the Web Push API, Background Service Workers, and `Notification.requestPermission()` in standard browser tabs. Push notifications can ONLY be enabled when the ERP is added to the user's Home Screen via Safari (**Share $\rightarrow$ Add to Home Screen**) and opened as a standalone PWA (`window.navigator.standalone === true` or `matchMedia('(display-mode: standalone)').matches`).
* **HTTPS Strict Origin**: Apple requires full HTTPS encryption; notification permissions cannot be requested over plain HTTP origins.
* **Visual Add-to-Home-Screen Guidance**: `NotificationControlCenter.jsx` automatically detects if the current device is an iOS browser running outside standalone mode and displays step-by-step installation instructions.

### 17.2 OneSignal Web SDK v16 Integration & Dual Admin Token Synchronization
* **Lifecycle Initialization**: The application embeds the OneSignal Web SDK v16 asynchronously using `window.OneSignalDeferred`.
* **Persona & Tag Binding**: Upon user selection, `syncOneSignalUser(currentUser)` calls `OneSignal.login(currentUser.id)` and sets semantic tags (`role: currentUser.role`, `name: currentUser.name || currentUser.nameAr`).
* **Automatic Push Opt-In**: If browser notification permission is already granted, `OneSignal.User.pushSubscription.optIn()` triggers automatically in the background without prompting the user repeatedly.
* **Multi-Persona Dual Admin Linking**:
  * In the ERP, the primary test persona (`usr_662444` / "Sherif Osama") and the system admin account (`usr_general_admin` / "Sherif (General Admin)") are mapped bidirectionally.
  * When either admin persona opts in or syncs a device token, the Subscription ID and push status are mirrored to both user documents in Firestore.
  * Target push dispatches directed to either admin ID automatically deliver to both personas, ensuring seamless testing and alerts across devices.

### 17.3 Free-Tier Cloud Push Dispatcher (Zero Cloud Functions / Spark & Blaze Compatible)
* **Direct HTTPS REST API Gateway**: Dispatches push notifications via direct HTTPS `POST https://api.onesignal.com/notifications` with `Authorization: Key {ONESIGNAL_REST_API_KEY}`.
* **Zero Backend Costs**: By calling OneSignal's REST API directly from the client, the application operates 100% on the free Firebase Spark or Blaze plans without requiring Node.js servers or paid Google Cloud Functions.
* **4-Way Targeting Strategy**:
  1. **Direct Subscription IDs** (`include_subscription_ids: [subId]`)
  2. **User Persona External IDs** (`include_aliases: { external_id: [userId] }` with `target_channel: 'push'`)
  3. **Role Tags** (`filters: [{ field: 'tag', key: 'role', relation: '=', value: role }]`)
  4. **Broadcast All** (`included_segments: ['Subscribed Users']`)
* **Deep Linking**: Push payloads deliver direct action URLs (`/#tab={targetTab}&highlight={docId}`) that navigate and highlight the exact transaction row upon click.

### 17.4 Universal Push Dispatcher & Admin Notification Control Center
Located inside `AdminControlPanel.jsx` $\rightarrow$ **Notification Control Center**:
* **Live Cloud Player Reconciliation**: Manual 1-click sync fetches all registered device tokens directly from OneSignal Cloud into Firestore.
* **Device Registry & Platform Classifier**: Automatically categorizes connected devices (`iPhone (PWA Standalone)`, `MacBook / Mac OS`, `Windows PC`, `Android Mobile`).
* **Interactive Dispatch Tester**: Test push notifications instantly with custom Arabic/English titles, body text, preset action templates, and target user selectors.
* **Audio-Visual Feedback**: Synthesizes a high-clarity notification chime via HTML5 Audio and triggers native device vibration patterns (`navigator.vibrate([150, 100, 200])`).

---

## 18. Firestore Performance Engineering, Quota Guardrails & Offline Cache

Configuration: `src/firebase.js`  
Engine: `src/utils/oneSignalEngine.js` & `src/hooks/useHeaderAlerts.js`

### 18.1 Write-Loop Prevention & `isAlreadySynced` Guardrails
In reactive Firestore applications, combining real-time listeners (`onSnapshot('users')`) with state-dependent writes (`setDoc`) can generate catastrophic recursive write loops.

```text
[onSnapshot('users')] ──> [usersList update] ──> [currentUser recomputed]
         ▲                                                │
         │                                                ▼
  [Cloud Write] ◄── [setDoc(userRef)] ◄── [syncOneSignalUser(currentUser)]
```

* **Root Cause Elimination**: Removed dynamic timestamps (`deviceLastActive: new Date().toISOString()`) from routine user sync operations.
* **Deep Equality Check (`isAlreadySynced`)**:
  ```javascript
  const isAlreadySynced =
    currentUser.onesignalSubscriptionId === subId &&
    currentUser.pushEnabled === Boolean(permission && optedIn) &&
    currentUser.deviceType === detectDeviceName();

  if (isAlreadySynced) return; // Completely skips Firestore write
  ```
* **Scoped Effect Dependencies**: In `App.jsx`, effects depend strictly on primitive IDs (`[currentUser?.id]`) rather than object references, preventing spurious re-renders from triggering cloud writes.

### 18.2 Persistent Multi-Tab IndexedDB Local Cache (`persistentLocalCache`)
Firestore is initialized in `src/firebase.js` with multi-tab persistent local cache enabled:
```javascript
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
```
* **Read Quota Slashed by 95%+**: Unchanged documents (users, items, categories, BOMs, settings) are read directly from the browser's IndexedDB, eliminating redundant cloud reads.
* **Multi-Tab Synchronization**: Background coordination between browser tabs shares a single synchronized local cache.
* **Offline & Quota Exhaustion Immunity**: If network connectivity drops or Cloud Firestore quotas are temporarily exceeded, the ERP continues to load and display data seamlessly from local IndexedDB.

### 18.3 Decoupled Boot Migrations & On-Demand Maintenance
* **Decoupled Backfills**: Removed `backfillPendingActions()` from root mount `useEffect`.
* **Decoupled Cloud Reconciliations**: Removed `syncOneSignalDevicesWithFirestore()` from Notification Center mount.
* **Administrative Isolation**: Heavy data scans and migrations are relegated strictly to deliberate manual button triggers in the Admin Control Panel.

### 18.4 Quota Thresholds, Daily Resets & Zero-Cost Blaze Architecture
* **Spark (Free) Daily Limits**: 50,000 document reads/day, 20,000 document writes/day, 20,000 document deletes/day.
* **Automatic Reset Schedule**: Quotas reset every day at `00:00 PST` (Pacific Standard Time), which corresponds to `07:00 UTC` and `10:00 AM` local time (Egypt / Saudi Arabia).
* **Blaze Pay-As-You-Go Safeguard**: Upgrading to Blaze retains the exact same free daily allowances ($0.00 cost) while eliminating hard database freezes during accidental spikes.

---

## 19. TopNavbar Live Persona Switcher & Mobile UX Polish

Components: `src/components/TopNavbar.jsx`, `src/components/InAppAlertToast.jsx`, `src/components/LandingPage.jsx`

### 19.1 TopNavbar Live Persona Switcher
* **In-Context Switching**: Top Navbar right controls feature an embedded persona selection dropdown, allowing immediate switching between test accounts without returning to the Landing Page.
* **Persistent Selection**: User selection is saved to `localStorage.setItem('tawoos_current_user_id', userId)`, persisting active persona across tab reloads and mobile browser sessions.

### 19.2 Native Select Contrast & Cross-Platform Styling
* **macOS Safari / Chrome Contrast Fix**: Stripped conflicting Tailwind background and color classes from native `<option>` tags, resolving an issue where persona options rendered as blank blocks on macOS and iOS.
* **Visual Role Indicators**: Selection options display localized badges distinguishing General Admins from Standard Users (`(مسؤول عام / Admin)` vs `(مستخدم / User)`).

### 19.3 15-Second In-App Alert Banner (`InAppAlertToast.jsx`)
* **Floating Real-time Toast**: Renders high-priority action and notification alerts at the top-right / top-center of the screen.
* **Progress Countdown Bar**: 15-second visual progress bar with automatic pause when the user hovers over the alert card.
* **1-Click Deep Navigation**: Clicking the toast navigates directly to the target module and tab, automatically scrolling to and highlighting the relevant transaction row.

---

## 20. Finance, Accounts & Physical Liquidity Architecture (المالية والحسابات والسيولة)

All treasury, bank accounts, accounting ledgers, and financial statements are unified under the single **Finance & Accounts (المالية والحسابات)** module (`finance`), consolidating cash physical custody, banking operations, and financial reporting into one coherent department.

### Module Tab Hierarchy
1. **Tab 1: Cash Safes & Vaults (`cash_safes`) — Active & Fully Live**:
   * **Subtab 1: Safes & Vaults (`safes_hub`)**: Multi-safe tracking (Safe 1, Safe 2, custom safes), live book balances, banknote counting ($200 \dots 0.5$), zero-sum change exchange, physical audit & discrepancy reconciliation, supplier AP bill matching, and A4 print slips.
   * **Subtab 2: Custodies & Advances (`custodies_advances`)**: Worker petty cash custody and salary advance ledger with 1-click invoice expense liquidation.
2. **Tab 2: Bank Accounts & Cheques (`banks`) — Phase 2 Architecture**:
   * **Subtab 1: Authorized Bank Accounts (`bank_list`)**: Corporate bank accounts (CIB, QNB, Banque Misr), IBANs, and real-time bank balances.
   * **Subtab 2: Cheques & Notes Payable/Receivable (`cheques_ledger`)**: Cheque portfolio tracking across life stages.
   * **Subtab 3: Bank Reconciliation (`bank_reconciliation`)**: Automated matching between ERP bank records and uploaded statements.
3. **Tab 3: Chart of Accounts & General Ledger (`accounts`) — Central Accounting Core**:
   * **Subtab 1: Chart of Accounts Tree (`chart_tree`)**: 4-to-6 level accounting tree.
   * **Subtab 2: Journal Vouchers (`journal_vouchers`)**: Automated double-entry vouchers from inventory, procurement, and treasury.
   * **Subtab 3: Trial Balance (`trial_balance`)**: Periodic debit/credit balance verification.
4. **Tab 4: Financial Statements & Reports (`financial_statements`) — Executive Intelligence**:
   * **Subtab 1: Income Statement (`income_statement`)**: P&L and gross margin derived from actual BOM manufacturing costs.
   * **Subtab 2: Balance Sheet (`balance_sheet`)**: Live asset/liability standing including physical stock and cash liquidity.
   * **Subtab 3: Cash Flow Statement (`cash_flow`)**: Operating, investing, and financing cash flow tracking.

Components:
- `src/utils/tafqeet.js`: Financial Arabic number-to-words converter (EGP, USD, EUR, SAR).
- `src/utils/cashLedgerEngine.js`: Single Source of Truth (SSOT) cash transaction ledger, banknote inventory integrity, exchange, audit, reversal, and custody engine.
- `src/components/CashSafesMaster.jsx`: Master cash vault and treasury workspace with live safe balances, denomination breakdown tiles, chronological transaction table, multi-parameter filtering, and modal triggers.
- `src/components/FinanceUpcomingView.jsx`: Interactive architectural roadmap workspace for Bank Accounts, Chart of Accounts & GL, and Financial Statements.
- `src/components/CashVoucherModal.jsx`: Unified cash transaction creator handling all 7 voucher types, interactive banknote breakdown counter, auto-calculate change helper, two-tier Chart of Accounts (Main GL + Sub-Ledger), supplier PO/GRN bill settlement linkage, Egyptian tax classification (VAT 14% + WHT 1%), and multi-file attachments.
- `src/components/CashChangeModal.jsx`: Zero-sum change exchange modal (فكة وتظبيط فئات) enforcing mathematical equivalence ($\Delta \text{Balance} = 0$) between outgoing and incoming banknote denominations.
- `src/components/CashCountAuditModal.jsx`: Physical safe count verification tool comparing actual counted paper money against book balances, supporting all audit events (periodic, shift handovers, daily close) and generating automated surplus/deficit discrepancy vouchers.
- `src/components/CustodiesAdvancesMaster.jsx`: Active workers custody (عهدة) and salary advance (سلفة) tracking ledger, supporting 1-click invoice expense liquidation and account statement views.
- `src/components/DynamicSafeSettingsModal.jsx`: Custom safe configuration and provisioning tool allowing dynamic color coding, responsible cashiers, authorizers, and safety ceiling limits.
- `src/components/CashVoucherPrintSlip.jsx`: Official A4 printable cash voucher slip with Arabic Tafqeet, verification QR code, breakdown table, and 3 signature blocks (المستلم، أمين الخزينة، الاعتماد المالي).

### 20.1 Banknote Inventory Tracking & Egyptian Pound Denominations
* **Physical Bill Tracking**: Every physical safe tracks an exact banknote inventory for all Egyptian Pound denominations:
  $$\text{Denominations} = \{ 200, 100, 50, 20, 10, 5, 1, 0.5 \}$$
* **Mathematical Invariant**: For every safe $s$, the total book balance must strictly equal the sum of its denomination quantities multiplied by their values:
  $$\text{Balance}(s) = \sum_{d \in \text{Denominations}} \left( d \times \text{Count}(s, d) \right)$$
* **Outflow Sufficiency Verification**: When issuing any disbursement or outward exchange, `checkSufficientBanknotes()` verifies that the safe possesses at least the requested count of every banknote bill. Transactions are rejected if physical bills are insufficient, preventing negative denomination counts.

### 20.2 SSOT Cash Ledger Engine & Atomic Transaction Posting (`cashLedgerEngine.js`)
* **Transaction Types Supported**:
  1. `disbursement` (صرف نقدي عام): General cash outflows.
  2. `collection` (تحصيل نقدي عام): General cash receipts and client inflows.
  3. `custody_issue` (صرف عهدة مؤقتة للعاملين): Worker operational petty cash issuance.
  4. `custody_return` (رد واسترداد باقي العهدة): Remaining cash refund from employee custody.
  5. `advance_issue` (صرف سلفة على الراتب): Worker salary advance outflow.
  6. `advance_return` (سداد ورد سلفة نقداً): Worker salary advance repayment.
  7. `supplier_payment` (سداد نقدي لمورد): Direct AP supplier bill settlement with PO/GRN matching.
* **Atomic Firestore Updates**: All voucher postings execute within atomic Firestore transactions or batch writes, updating the safe's book balance, denomination counts, transaction history ledger (`cash_transactions`), and custody ledger (`custody_ledger`) simultaneously.

### 20.3 Zero-Sum Change Exchange Mode (فكة وتظبيط فئات)
* **Zero Net Effect**: Enables exchanging larger notes for smaller notes (or vice versa) without altering the safe's total monetary balance ($\text{Total In} = \text{Total Out}$).
* **Inventory Balancing**: Outgoing bills are deducted while incoming bills are credited to the safe's denomination stock.

### 20.4 Unified Physical Safe Audit & Discrepancy Reconciliation Tool (جرد وتظبيط رصيد)
* **Physical Count Verification**: Replaces fragmented shift handover screens with a single, authoritative audit tool.
* **Discrepancy Calculation**:
  $$\text{Discrepancy} = \text{Actual Count Total} - \text{Book Balance}$$
* **Automatic Discrepancy Posting**:
  - If $\text{Discrepancy} > 0$: Issues an automated Surplus voucher (تحصيل وتظبيط زيادة جرد) crediting the safe and posting to `7100 - إيرادات متنوعة وأرباح تسوية جرد نقدية`.
  - If $\text{Discrepancy} < 0$: Issues an automated Deficit voucher (صرف وتظبيط عجز جرد) debiting the safe and posting to `5900 - خسائر وعجز تسوية جرد النقدية`.
  - If $\text{Discrepancy} = 0$: Records a clean audit certification log in `cash_count_sessions`.

### 20.5 Two-Tier Chart of Accounts Hierarchy & Strict Child Account Adherence Everywhere
* **Strict Child Account Adherence Architecture**:
  - In full alignment with professional double-entry accounting standards, all operational transactions from any source (**Cash Treasury Vouchers, Journal Entries, GRN Accruals, Reversals, Inventory Adjustments**) must strictly post to **Leaf / Child Accounts** (`type === 'sub'`, Level 4 or lowest non-parent account).
  - **Father / Parent Accounts (`type === 'main'`)**: Control / Umbrella accounts that serve strictly as rollup summary headers. Raw operational transactions must never be stranded directly on father accounts when child accounts exist beneath them.
  - **Universal Posting Resolution Engine (`resolveCashTransactionPostingLegs` & `cashLedgerEngine.js`)**: Whenever a transaction specifies a child account (e.g. `subAccountId`, `subAccountCode`, or `childAccountCode` matching an active account code in `chart_of_accounts`), the engine automatically routes the posting leg directly to that child account code everywhere (Trial Balance, General Journal, Auxiliary Sub-Ledger, Financial Statements, and Diagnostics).
  - **Creation-Time Enforcement (`CashVoucherModal.jsx`)**: When a user selects a parent category and chooses a specific sub-account under it, the system stores the child account code directly as the primary posting account (`mainAccount`), preserving `parentAccountCode` for hierarchical reporting. Selecting a child account is required when picking a parent account with active children.
* **Main GL Account (الأستاذ العام)**: Standardized accounts including:
  - `1110 - النقدية وما في حكمها (الخزائن)`
  - `1130 - العهد النقدية للعاملين`
  - `1140 - سلف العاملين والذمم المدينة`
  - `2110 - الموردون وحسابات الدائنين التجاريين`
  - `5100 - مصروفات عمومية وإدارية`
  - `5200 - مصروفات التشغيل والإنتاج`
  - `5300 - مصروفات الصيانة ومستلزمات التشغيل`
  - `5400 - مصاريف نقل ومحروقات وتوزيع`
  - `5900 - خسائر وعجز تسوية جرد النقدية`
  - `7100 - إيرادات متنوعة وأرباح تسوية جرد نقدية`
* **Sub-Ledger (الأستاذ المساعد)**: Analytical specific child ledger accounts (e.g., `4010201` إيراد بيع توالف وهوالك, `4010202` فوائد دائنة, `4010203` إيرادات استثمارات بنكية).
* **Egyptian Tax Compliance**: Each transaction record specifies tax status:
  - `taxable`: With 14% VAT and 1% WHT breakdown fields and tax invoice numbers.
  - `non_taxable`: Exempt expenses or government fees.
  - `no_doc`: Internal cash transactions without official invoices.

### 20.6 Integrated Worker Custody (عهدة) & Salary Advance (سلفة) Ledger
* **Real-time Balance Cards**: Worker custody balances are tracked in `custody_ledger`.
* **1-Click Expense Liquidation**: Employees can liquidate custodies by submitting invoices and receipts (`liquidateCustodyWithExpenses`), deducting the custody balance without requiring cash back into the safe.
* **Settlement Statements**: Full historical ledger of disbursements, liquidations, and refunds per worker.

### 20.7 Official A4 Printable Cash Voucher Slip (`CashVoucherPrintSlip.jsx`)
* **Arabic Tafqeet**: Automatic conversion of decimal currency numbers into full formal Arabic financial text (e.g., "فقط خمسة وأربعون ألف جنيه مصري لا غير").
* **Verification QR Code**: Generates standard verification QR code encoding voucher ID, safe ID, amount, date, and cashier identity.
* **Denomination Table**: Detailed breakdown grid of banknote quantities and values printed directly on the voucher slip.
* **Triple Digital Signatures**: Printed signature spaces for Recipient (المستلم), Vault Custodian (أمين الخزينة), and Financial Controller (الاعتماد المالي).

### 20.8 Dynamic Safe Provisioning, Colors, Cashiers & Safety Ceilings
* **Pre-configured Safes**: Initialized with `SAFE-01` (الخزينة الرئيسية - Main Safe) and `SAFE-02` (خزينة الصالة والمبيعات - Floor Vault).
* **Dynamic Safe Management**: General Admins can create unlimited custom safes, customize accent colors (`emerald`, `blue`, `amber`, `purple`), assign authorized cashiers, and define safety ceilings with automatic visual progress alerts.

### 20.9 Automated Double-Entry Operational Accounting Hooks (PO, GRN, Cash, Custody, Work Orders)
Every real-world manufacturing and procurement transaction in Al-Tawoos ERP automatically compiles into balanced double-entry accounting records:
$$\sum \text{Debit} = \sum \text{Credit}$$

#### Operational Event Postings Matrix:
1. **Purchase Orders (`POCreation.jsx`)**:
   - Creates commercial commitments and payment schedule expectations.
   - **Non-Taxable Rule**: If `isTaxOfficial` is `false`, Withholding Tax (`totalWht`) is strictly enforced to `0.00` and line item `vatPercent` and `whtPercent` are stored as `0`.
2. **Goods Receipt Confirmation (`GoodsReceipt.jsx` - GRN)**:
   - Debit: `1210 - مخزون خامات ومستلزمات إنتاج` (`inventoryRawMaterials`) $\rightarrow$ Subtotal
   - Debit: `1180 - ضريبة القيمة المضافة - مدخلات 14%` (`vatInput`) $\rightarrow$ Total VAT [if `isTaxOfficial`]
   - Credit: `2110 - الموردون وحسابات الدائنين التجاريين` (`accountsPayable`) $\rightarrow$ Net Payable (Sub-Ledger: Supplier ID)
   - Credit: `2180 - ضريبة الخصم والإضافة أ.ت.ص 1% مستحقة` (`whtPayable`) $\rightarrow$ Total WHT [if `isTaxOfficial`]
3. **Goods Receipt Reversal / Return (`GoodsReceipt.jsx` - RTN)**:
   - Generates exact counter-balanced reversal entry (`buildGrnReversalJournalEntry`) restoring vendor balances and inventory valuations.
4. **Treasury Cash Disbursements & Collections (`CashVoucherModal.jsx`)**:
   - Payment to Supplier: Debit `2110` (AP), Credit `1110` (Cash in Safe).
   - Collection from Client: Debit `1110` (Cash in Safe), Credit `1120` (AR).
5. **Worker Custody Advance & Expense Liquidation (`CustodiesAdvancesMaster.jsx`)**:
   - Issue Advance: Debit `1130 - العهد النقدية للعاملين` (Worker Sub-Ledger), Credit `1110 - الخزينة`.
   - Liquidate Expenses: Debit `5100/5200 - مصروفات عمومية وتشغيلية` (Cost Center), Credit `1130 - العهد النقدية`.
6. **Finished Goods Inward from Factory Floor (`FinishedGoodsInward.jsx`)**:
   - Debit: `1230 - مخزون الإنتاج التام` (`inventoryFinishedGoods`) $\rightarrow$ Total Standard/Actual Cost
   - Credit: `1220 - حساب تشغيل الإنتاج تحت التشغيل (WIP)` (`inventoryWIP`) $\rightarrow$ Total Cost

---

### 20.10 Audit-Ready Journal Ledger, Attachment Popovers & 1-Click Reversals (`REV-`)
Located at `#accounts` (Subtab 1 - Default):
* **Chronological General Ledger**: Lists all automated and manual journal entries with transaction date, voucher number, description, total debits, total credits, and balance verification.
* **Zero-Imbalance Integrity Badge**: Each row displays an instant mathematical verification badge (Balanced $\Delta = 0$). Any discrepancy triggers a bold amber warning.
* **Dynamic Source Documentation Popovers**:
  - Automatically identifies whether an entry carries operational origin attachments (e.g., supplier delivery notes, cash count slips, custody invoices) or user-uploaded scanned vouchers.
  - Hovering/clicking the paperclip icon opens the document popover with thumbnail preview, file metadata, and 1-click full-screen zoom (`AttachmentViewerModal.jsx`).
* **One-Click Journal Reversals**:
  - Reverses any confirmed journal entry by generating an inverted mirror voucher prefixed with `REV-`.
  - Links both entries together in the Firestore audit log with user identity and timestamp.
* **Isolated A4 Journal Voucher Slip (`JournalVoucherPrintSlip.jsx`)**:
  - Optimized print preview isolating the voucher card from web chrome.
  - Formatted for standard A4 paper with Arabic Tafqeet, QR code, and signatures.

---

### 20.11 Dual-Ledger Architecture & Discreet Administrative Unlock Protocol (`SecretLockButton`)
Al-Tawoos ERP features a parallel-ledger engine separating administrative managerial reality from statutory tax compliance:
* **Ledger Modes**:
  1. `LEDGER_MODES.MANAGEMENT` (`management`): Default active mode. Includes 100% of transactions, internal adjustments, factory floor movements, and cash flows.
  2. `LEDGER_MODES.TAX_OFFICIAL` (`tax_official`): Statutory audit-ready ledger. Filters exclusively for official VAT invoices, formal tax receipts, and registered legal documents.
* **Discreet Administrative Unlock Protocol (`SecretLockButton.jsx`)**:
  - **Zero Suspicious Visual Markers**: No public toggle or dropdown mentions terms like "official", "tax", "رسمي", or "ضريبي".
  - **Interaction Mechanism**: Single clicks do not activate the secret door. Only a **continuous 2.0-second long press** on the discreet lock icon triggers the authorization modal.
  - **Passcode Verification (`SecretDoorModal.jsx`)**: Validates the entered administrative PIN against Firestore document `system_config/ledger_security` (`securityPin`).
  - **Admin Control Panel Integration**: The PIN can be audited, changed, or reset directly from the Admin Control Panel's dedicated Security sub-tab by authorized General Admins.

---

### 20.12 Manual Adjustment Journal Entries & Zero-Variance Lock (`ManualJournalEntryModal`)
Enables authorized accounting personnel to post adjusting, closing, and reclassification entries:
* **Zero-Variance Lock**: The save button remains strictly disabled unless the entry is balanced to two decimal places:
  $$\left| \sum \text{Debits} - \sum \text{Credits} \right| < 0.005$$
* **Multi-Line Flexibility**: Supports unlimited debit and credit lines with individual memo/description fields that never truncate (`whitespace-normal break-words`).
* **Searchable GL Account Selector**: Utilizes `SearchableSelect.jsx` for rapid code or name filtering across the complete Chart of Accounts.
* **Dynamic Sub-Ledger & Cost Center Engine**:
  - Auto-detects sub-ledger entity types (Suppliers, Clients, Workers, Safes, Warehouses).
  - Includes dynamic Cost Centers with inline `+ Add New Cost Center` modal, immediately saved to Firestore (`system_config/cost_centers`) and available across all active sessions.

---

### 20.13 Comprehensive Filterable Trial Balance & Automated Diagnostic Assistant (`ChartOfAccountsMaster.jsx`)
Located at `#accounts` (Subtab 2):
* **Strict Child Account Attribution**: All posted voucher and accrual movements are credited/debited to their specific child accounts (`4010201`, `4010202`, etc.) rather than father accounts.
* **Universal Parent Account Rollup**:
  - All parent accounts (`4`, `401`, `40102`, etc.) automatically and dynamically display the consolidated bottom-up sum of their children across debit, credit, opening net, period movements, and ending net balances.
  - Multi-tier recursive aggregation guarantees that Level 3 accounts aggregate Level 4 leaves, Level 2 accounts aggregate Level 3 parents, and Level 1 roots reflect the entire class balance.
  - Prefix-based tree fallback ensures continuous parent-child inheritance even when legacy accounts omit explicit parent foreign keys.
* **Neutral Hierarchical Visual Distinction (Without Row Background Colors)**:
  - Strict adherence to professional accounting aesthetics: no disruptive full-row background color fills.
  - Visual hierarchy is established via:
    * **Proportional Indentation**: 20px indentation per level (`(level - 1) * 20px`).
    * **Tree Branch Connectors**: Structural glyphs (`├──`, `└──`) and folder/bullet icons distinguishing parent categories from posting leaves.
    * **Level Badges**: Distinct outline badges (`L1`, `L2`, `L3`, `L4`) for instant hierarchy recognition.
    * **Typographic Hierarchy**: Level 1 (black heavy font, prominent borders), Level 2 (extra-bold), Level 3 (bold), Level 4 (medium analytical text).
    * **Structural Borders**: Level 1 root accounts feature top boundary dividers (`border-t-2 border-slate-300`) to neatly group major accounting classes.
* **Cash General Ledger Safe Sub-Ledger Resolution**:
  - For cash transaction double-entry legs, the safe/vault leg strictly stamps the source/destination safe name and ID as its sub-ledger (`subledgerName: safeDoc.nameAr, subledgerId: tx.safeId, subledgerType: 'safe'`), preventing orphaned or dash-only subledger labels.
  - Counter-party legs show clean beneficiary/analytical notes without leading dashes.
* **Comprehensive Filter Toolbar**:
  - **Text Search**: Real-time filtering by Account Code or Account Name in Arabic and English.
  - **Account Level Filter**: Filter by hierarchy depth (All, Level 1 Major Class, Level 2 General Group, Level 3 Control Account, Level 4 Posting Account).
  - **Financial Statement Filter**: Filter by Balance Sheet (`balance_sheet`) or Income Statement (`income_statement`).
  - **Balance & Activity Status**: Filter by All Accounts, With Movement Only (evaluating parent rollup totals), Non-Zero Balance Only, Zero Balance Only, Debit Balances Only, or Credit Balances Only.
  - **Fiscal Period & Date Range**: Quick presets (**All Time, Today, This Month, This Quarter, This Fiscal Year, Custom Range**). When active, computes a multi-column professional Trial Balance: **Opening Balance (الرصيد الافتتاحي), Period Debits/Credits (حركات الفترة), and Ending Net Balance (صافي رصيد الإقفال)**.
  - **Cost Center Filter**: Real-time filtering by specific production, logistics, or factory administration cost centers (`system_config/cost_centers`).
  - **Dual-Ledger Governance**: Controlled globally via Secret Gate "7799" without redundant per-page toggles.
  - **Zero Double-Counting Grand Totals**: Trial Balance summary and footer totals strictly aggregate posting leaf accounts (`!r.hasChildren`), guaranteeing 100% mathematical equilibrium (`Total Debits == Total Credits`) across all views.
  - **One-Click Reset**: Instant reset button restoring default all-account view.
* **Automated Diagnostic Assistant (`TrialBalanceDiagnosticModal.jsx`)**:
  - Analyzes the entire ledger in real-time to detect root causes of trial balance imbalances, auditing against specific child posting accounts.
  - Flags unlinked sub-ledgers, orphaned line items, missing counter-entries, and single-sided legacy transactions.
* **Isolated A4 Print Engine (`TrialBalancePrintSlip.jsx`)**:
  - Dedicated full-screen print view formatted for A4 portrait.
  - Fully supports parent account rollups, proportional level indentation, and zero double-counting grand totals.
  - Displays corporate tax header, QR code, debit/credit totals, zero variance verification, and accounting manager sign-off blocks.
  - Strips all sidebar elements, navigation bars, and background colors via `.no-print` CSS isolation.

---

### 20.14 Financial Statements (Income Statement, Balance Sheet, Cash Flow) & Isolated A4 Printing
Located at `#financial_statements`:
* **Income Statement (قائمة الدخل)**: Calculates Gross Profit, Operating Profit, and Net Income derived directly from actual BOM manufacturing consumption, sales revenue, and operational expenses.
* **Balance Sheet (الميزانية العمومية والمركز المالي)**: Real-time asset/liability valuation aggregating live inventory kardex valuations, physical safe cash counts, accounts receivable, and accounts payable.
* **Cash Flow Statement (قائمة التدفقات النقدية)**: Direct cash flow classification across Operating, Investing, and Financing activities.
* **A4 Print Slips (`FinancialStatementPrintSlip.jsx`)**: Clean, corporate-grade A4 financial reports with period selectors and executive summaries.

---

### 20.15 Dynamic Scoped URL Hash Routing & Native Reload Support
Guarantees clean, real-time URL state synchronization and reliable state restoration across desktop and mobile without UI clutter:
* **Dynamic Scoped Hash Routing**:
  - The URL hash accurately reflects the live application state: `#tab?subTab=subTabId&module=moduleId`.
  - **Parameter Scoping on Tab Switch**: When navigating between main tabs, tab-specific parameters (`subTab`, `voucherId`, `recordId`, etc.) from previous screens are cleanly discarded. New tabs immediately start with clean scoped parameters.
  - **Live Subtab Synchronization**: Screens with sub-views (Stock Balances, Chart of Accounts, Cash Safes, Financial Statements, Work Orders, Admin Control Panel, Partner Statements) synchronize their active view to `subTab` in the URL hash via `window.history.replaceState`.
* **Native Desktop Reload & Mobile Pull-to-Refresh**:
  - When a user presses native reload (F5 / Cmd+R / browser reload button) or pulls down on mobile:
    - The browser reloads the current URL (`#tab?subTab=...&module=...`).
    - `App.jsx` evaluates `getInitialRoute()` synchronously on startup, booting straight into the active tab and module.
    - Each active component initializes its sub-view directly from `subTab` in the URL query string, restoring the exact state with zero visual landing page flash.
* **Removal of Redundant In-App Refresh Buttons**:
  - Because native browser reload and mobile pull-down naturally and reliably restore the exact active view, redundant in-app refresh buttons previously rendered in `TopNavbar` and `TabPageHeaderBanner` have been removed to eliminate visual clutter.

---

### 20.16 Future Module Financial Integration Guidelines & Double-Entry Boilerplate
When adding new operational modules (e.g. Sales Invoicing, Asset Depreciation, Payroll, Delivery Shipping), developers **must adhere** to the following integration protocol:

#### Integration Checklist for New Modules:
1. **Define Accounting Hooks in `DEFAULT_ACCOUNTING_LINKS` (`src/utils/cashLedgerEngine.js`)**:
   Map each operational event to configurable GL accounts in the Master Links configuration.
2. **Implement Automated Journal Entry Generation**:
   Whenever a critical operational event is confirmed (e.g., invoice issued, payroll run, asset retired), generate a balanced journal voucher:
   ```javascript
   const journalEntry = {
     voucherNo: `JRN-${eventType.toUpperCase()}-${recordId}`,
     date: new Date().toISOString().split('T')[0],
     originType: 'sales_invoice', // or 'payroll', 'asset_depreciation'
     originId: recordId,
     descriptionAr: `إثبات قيد ${recordTitle}`,
     descriptionEn: `Posting for ${recordTitle}`,
     lines: [
       {
         accountCode: accountingLinks.accountsReceivable || '1120',
         accountNameAr: 'العملاء والذمم المدينة',
         debit: totalInvoiceAmount,
         credit: 0,
         subLedgerType: 'client',
         subLedgerId: clientId,
       },
       {
         accountCode: accountingLinks.salesRevenue || '4100',
         accountNameAr: 'إيرادات مبيعات المنتجات التامة',
         debit: 0,
         credit: netSalesAmount,
         costCenter: targetSalesRegion,
       },
       {
         accountCode: accountingLinks.vatOutput || '2170',
         accountNameAr: 'ضريبة القيمة المضافة - مخرجات 14%',
         debit: 0,
         credit: vatAmount,
         condition: isTaxOfficial && vatAmount > 0,
       }
     ],
     isTaxOfficial: Boolean(record.isTaxOfficial),
     status: 'confirmed',
     createdAt: serverTimestamp(),
     createdBy: currentUser.name
   };
   ```
3. **Inherit Attachments**:
   Pass source documents (scans, receipts, signed handovers) into `attachments: record.attachments || []` so they automatically appear in the Journal Ledger popover.
4. **Implement Counter-Reversal Logic**:
   Provide a corresponding reversal generator (`buildReversalJournalEntry`) to handle cancellations and returns cleanly.
5. **Enforce Non-Taxable WHT Guard**:
   Whenever creating orders or invoices, verify that non-taxable transactions force VAT and WHT to strictly `0.00`.
6. **Include `TabPageHeaderBanner.jsx`**:
   Render `<TabPageHeaderBanner activeTab={tabId} ... />` at the top of the new screen to automatically inherit the Universal Database Refresh button and customization controls.

---

## 21. Inter-Safe Transfer Two-Party Handshake & Partner Statements Architecture

### 21.1 Two-Party Custody Handshake for Vault / Safe Transfers
* **Separation of Concerns**: Inter-safe transfers (`safe_transfer`) are **strictly excluded** from the Cash Disbursement modal (`CashVoucherModal.jsx`) and can only be executed via the dedicated `InterSafeTransferModal.jsx`.
* **Two-Party Handshake Architecture**:
  1. **Initiation (`initiateInterSafeTransfer`)**:
     - The custodian of the source safe (`sourceSafe.responsibleUserId` or authorized finance officer) initiates the transfer.
     - Performs strict validation on total funds and banknote denominations sufficiency.
     - **Deducts funds and notes from the Source Safe immediately** (money leaves source custody).
     - Target Safe balance is **not** credited yet.
     - Staged in `cash_transactions` with `status: 'pending_receiver_approval'`.
     - Creates an entry in `user_actions_queue` via `createActionRequired` targeting `targetSafe.responsibleUserId` and General Admin.
  2. **Confirmation / Approval (`confirmInterSafeTransfer`)**:
     - The receiving safe custodian verifies the physical banknotes.
     - Upon confirmation, funds and denominations are credited to the Target Safe.
     - Transaction status transitions to `posted`, stamping `receivedByUserId`, `receivedByName`, and `receivedAt`.
     - Completes the Action Required task (`completeActionRequired`).
  3. **Rejection & Custody Refund (`rejectInterSafeTransfer`)**:
     - If the receiving custodian rejects the transfer (e.g., shortage in physical notes), the amount and exact denominations are refunded back to the Source Safe.
     - Status transitions to `rejected`, recording the rejection reason.
     - Action Required task is closed.
* **UI Alerts in `CashSafesMaster.jsx`**:
  - Displays a prominent amber **Incoming Transfers Alert Card** on the active safe view whenever `targetSafeId === activeSafe.id` and `status === 'pending_receiver_approval'`.
  - Displays an outgoing transfer strip indicating funds dispatched awaiting target receipt.

### 21.2 Supplier & Client Statement of Account (`party_statements`)
* **Component**: `src/components/PartnerStatementsMaster.jsx`
* **Route & Navigation**: Finance module -> `party_statements` tab (Label: "كشوف حسابات الموردين والعملاء").
* **Supported Entities**:
  - **Suppliers (Accounts Payable)**: Aggregates Goods Receipts (`goods_receipts`), Supplier Returns, Cash Disbursements (`cash_transactions`), and procurement journal entries.
  - **Clients (Accounts Receivable)**: Aggregates Sales Delivery receipts, Cash Collections (`cash_transactions`), and client journal entries.
* **Comprehensive Filter Bar**:
  - **Period Presets**: Today, This Week, This Month, Last Month, This Quarter, Fiscal Year, All Time, Custom Date Range.
  - **Show / Hide Reversed Transactions Toggle (`showReversed`)**:
    - Default is `false` (clean audit view of live, non-reversed records).
    - When toggled `true`, shows voided/reversed records with strikethrough styling and reversal badge/justification.
  - **Document Type Filters**: All, Goods Receipts (GRN), Cash Disbursements, Cash Collections, Journal Entries.
  - **Tax Classification**: Multi-option filter: All Transactions (`all`), All Taxable Documents (`tax_all`), Tax Invoices Only (`invoices`), Credit Notes Only (`credit_notes`), Debit Notes Only (`debit_notes`), and Internal Non-Tax Receipts (`non_tax`).
  - **Search**: Free-text search across document IDs, descriptions, references, tax invoice numbers, credit note numbers, and debit note numbers.
* **Double-Entry Running Balance Engine**:
  - Calculates **Opening Balance** strictly prior to `fromDate`.
  - Sequentially calculates **Running Balance** for each in-period transaction.
  - Summarizes Period Debits, Period Credits, Net Movement, and Closing Balance.
  - Displays Arabic Tafqeet for the closing amount.
* **Official A4 Print Slip (`PartnerStatementPrintSlip.jsx`)**:
  - Isolated `@media print` portal rendering that eliminates backgrounds, sidebars, and navigation elements.
  - Company letterhead, QR code deep-link, partner tax details, statement period, bordered transactions table, Arabic Tafqeet, and 4-party signatures block.
* **Excel / CSV Export**:
  - One-click UTF-8 with BOM export ensuring Arabic text renders correctly in Excel.
  - Includes dedicated columns for Tax Document Type, Official Tax Document Number, and ETA E-Invoicing Registration status.

### 21.3 Taxable Documents Prioritization & ETA E-Invoicing Reconciliation Standard
In B2B business accounting under the Egyptian Tax Authority (ETA) e-invoicing and VAT regulations, suppliers and clients reconcile ledgers by their **official taxable document numbers** rather than internal warehouse receipt numbers (`GRN-xxx`) or internal cash payment vouchers (`VCH-xxx`).

* **First-Class Taxable Document Model**:
  Every transaction parsed in the partner statement extracts:
  - `taxDocType`: `'invoice'` (فاتورة ضريبية), `'credit_note'` (إشعار دائن - خصم/مرتجع), `'debit_note'` (إشعار مدين - إضافة/فروق), or `null` for internal documents.
  - `taxDocNumber`: The official taxable serial (e.g. `INV-2026-0891`, `CN-401`, `DN-102`).
  - `taxDocDate`: The official document issuance date.
  - `etaPortalRegistered`: Boolean flag indicating if the document is certified on the ETA electronic portal.
  - `isTaxOfficial`: Flag classifying taxable vs. non-taxable internal entries.

* **Tax Extraction Sources**:
  1. **Goods Receipts (`goods_receipts`)**:
     - Extracts `taxInvoiceNumber` / `supplierInvoiceNumber` / `poSnapshot.taxInvoiceNumber`.
     - Identifies Credit Notes (`creditNoteNumber` / return GRNs) and Debit Notes (`debitNoteNumber`).
     - Extracts `etaPortalRegistered` from invoice payload.
  2. **Cash Disbursements & Collections (`cash_transactions`)**:
     - Checks `creditNoteNumber`, `debitNoteNumber`, and `taxInvoiceNumber` from direct transaction fields or `taxDetails`.
  3. **Journal Entries & Direct Invoices (`journal_entries`)**:
     - Scans `creditNoteNumber`, `debitNoteNumber`, `taxInvoiceNumber`, `invoiceNumber`, and parsed reference strings (e.g., `CN-`, `DN-`, `INV-`, `دائن`, `مدين`, `فاتورة`).

* **Taxable Documents Fiscal Summary Ribbon (`taxStats`)**:
  Rendered directly above the statement ledger table:
  - **Tax Invoices (فواتير ضريبية)**: Displays active count and total monetary volume in EGP.
  - **Credit Notes (إشعارات دائنة)**: Displays active count and total deduction/credit volume.
  - **Debit Notes (إشعارات مدينة)**: Displays active count and total debit/addition volume.
  - **Grand Total Taxable Documents**: Cumulative count of official fiscal instruments for the period.

* **Dual-Column Presentation (Screen & Print)**:
  - **Screen UI (`PartnerStatementsMaster.jsx`)**: Prominent primary column `المستند الضريبي (فاتورة / إشعار دائن أو مدين)` with emerald/purple/amber badges, bold document numbers, dates, and `✓ منظومة الضرائب ETA` badges. Internal non-tax movements are clearly badged with a subtle gray indicator.
  - **Print Slip (`PartnerStatementPrintSlip.jsx`)**: Features an executive **Tax Documents Period Summary Strip** between partner data and the table, and includes a dedicated column in the printable table layout for the official tax instrument.

---

## 22. Dynamic Master Collections Architecture & Factory Reset Master Data Immunity

### 22.1 SSOT Dynamic Registry (`getMasterCollectionsRegistry`)
To eliminate static array drift and protect foundational organizational assets:
* **Dynamic Derivation**: Master collections are no longer hardcoded as a fixed 12-item list. Instead, `getMasterCollectionsRegistry(APP_ARCHITECTURE)` dynamically discovers all collections configured under `APP_ARCHITECTURE.modules.master_data.tabs` in `src/config/appArchitecture.js`, combining them with core system entities (`users`, `system_config`, and `chart_of_accounts`).
* **Zero-Touch Extensibility**: Whenever a new tab is added to the Master Database module (e.g. `safes`, `bank_accounts`, `vehicles`, `clients`), it is immediately and automatically:
  1. Registered in `MASTER_COLLECTIONS_REGISTRY`.
  2. Subscribed to in real-time by System Configuration MDM telemetry (`SystemConfigMaster.jsx`).
  3. Included in the "Select Master Data Only" filter within Central Admin Backup & Restore.
  4. Granted absolute immunity from operational database wipes.

### 22.2 Danger Zone: "Wipe Operational Data Only" Master Immunity Lock
In `AdminControlPanel.jsx` under Factory Reset / Danger Zone:
* **The Problem Solved**: Operational purges (`operational_only`) are designed to clear transactional movements (Work Orders, GRNs, Transfers, Stock Ledger, Breaks, Shifts, Cash Transactions, Journal Entries) and zero out stock balances before onboarding or new cycles. If master collections were static, new master tabs might risk being purged or left unprotected.
* **Double-Lock Purge Protection**:
  1. `collectionsToPurge` strictly filters candidate operational collections against `new Set(getMasterCollectionsRegistry(APP_ARCHITECTURE))`.
  2. Right before executing Firestore batch deletions, a second barrier (`finalCollectionsToPurge.filter(...)`) strips any collection belonging to the Master Collections registry.
  3. Item Master catalog records (`items`) retain their full product specifications, categories, and codes—only transient stock quantities and opening lot details are reset.
* **Dynamic UI & Telemetry Synchronization**:
  - The Danger Zone explanation card and confirmation dialog dynamically compute and display the exact active count of Master Collections (`${MASTER_COLLECTIONS_REGISTRY.length}`) and operational tables.
  - `SystemConfigMaster.jsx` displays real-time doc telemetry for all active master collections with live listeners and dynamic Arabic/English display name resolution (`getCollectionDisplayName`).

---

## 23. Cross-App Reusable Row-Level Collaborative Comments & Per-Message Task Engine (v3)

### 23.1 Reusable Plug-and-Play Architecture (`RecordCommentAction.jsx` & `useRecordComments`)
To guarantee consistency, zero boilerplate duplication, and effortless scalability across all present and future tabs:
* **Universal Reusable Component (`src/components/comments/RecordCommentAction.jsx`)**:
  - Exports `<RecordCommentAction />` and the companion hook `useRecordComments({ targetModule, targetTab, docId, docNumber, docLabel, isSensitive })`.
  - All modules and tabs integrate commenting exclusively through `<RecordCommentAction>`—manual inline comment button implementations are prohibited.
* **Strictly Row/Record-Level Granularity**:
  - Comments and tasks operate strictly at the **record/row level** (`fieldKey: null`, `targetType: 'row'`).
  - Modal dialogs are strictly excluded to keep workflows focused on persistent database records.

### 23.2 Conditional 3-Dots Action Grouping & Unread-Only Counter Badge
To keep table action columns uncluttered while surfacing active discussions immediately:
* **Grouped Inside 3-Vertical-Dots (`⋮`) When Unused (`totalCount === 0`)**:
  - If a record/row has **never had any comments** (`totalCount === 0`), the comment button is automatically hidden from the inline row bar and grouped inside the 3-vertical-dots (`⋮`) overflow menu (`mode="menu"` or `groupedWhenEmpty`).
* **Inline Visibility When Active (`totalCount > 0`)**:
  - As soon as a record has at least one comment (`totalCount > 0`), the comment icon renders directly inline on the row (`mode="inline"`).
* **Strict Unread-Only Counter Badge (`unreadCount`)**:
  - The numeric counter badge on the comment icon displays **strictly the count of unread messages** for the current user (`unreadCount`), never total message count.
  - Whenever all messages in the thread have been read by the current user (`unreadCount === 0`), the numeric counter badge is completely removed.

### 23.3 Context Menu Dynamic Icon Inheritance & Row Action Bridge (`CommentContextMenu.jsx`)
* **Dynamic Status Icon Inheritance**:
  - Right-clicking any commentable row (`data-comment-doc`) opens `CommentContextMenu.jsx`.
  - The context menu's comment action item dynamically inherits the exact icon and color state of that target record/row:
    - **Amber `AlertCircle`**: Active `isActionRequired` task pending on the row.
    - **Emerald `CheckCircle2`**: All threads on the row are resolved.
    - **Rose/Blue `MessageSquare` + Unread Badge**: Active thread with unread messages.
    - **Slate `MessageSquarePlus`**: No comments yet ("إضافة تعليق أو مهمة على هذا السجل").
* **Row Action Bridge**:
  - Below the comment action, the context menu automatically bridges and renders all other available action buttons on that row (Edit, Print, Audit Trail, Reverse, etc.).

### 23.4 Per-Message Read Tracking & Smart Auto-Scroll
* **Accurate Per-Message Read Detection (`readBy`)**:
  - Each message in `record_comments.messages` tracks `readBy: string[]` (array of user IDs who have read that message, initialized with the message author).
  - `getTargetCommentStats` computes `unreadCount` accurately by counting messages where `!msg.readBy?.includes(currentUser.id)`.
* **Automatic Scroll on Thread Open (`CommentThreadPopover.jsx`)**:
  - When a user opens a comment thread popover:
    1. The popover identifies the **first unread message** (`data-unread="true"`) prior to marking the thread read.
    2. It smoothly scrolls (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) directly to the **first unread message** (with a temporary "رسائل غير مقروءة / Unread Messages" divider banner), or automatically scrolls to the **last message** at the bottom if all messages were already read.
    3. It then invokes `markThreadAsRead(thread.id, currentUser.id)` to clear the unread counter.

### 23.5 Inline `@FullName` Mention Chips & Message-Level Task Resolution (`تم إنجاز المهمة`)
* **Full-Name `@username` Chip Insertion (`User+` & `@` Mention)**:
  - Whether a user assigns a task via the `User+` toolbar button or manually types `@` and picks a user from the autocomplete list, a `@FullName` chip (using the full user name `u.nameAr || u.name`, never truncated to the first name only) is automatically included in the message text and styled as an inline badge.
  - If multiple tasks are assigned within a single thread across different messages, each user can immediately see which specific message and instruction they are assigned to.
* **Message-Level Task Resolution (`تم إنجاز المهمة`)**:
  - Tasks are tracked and resolved **at the individual message level** (`msg.isActionRequired`, `msg.assignedUserIds`, `msg.actionQueueIds`, `msg.actionCompleted`, `msg.actionCompletedBy`, `msg.actionCompletedAt`) rather than only at the whole-thread level.
  - The assigned user (or General Admin) can resolve their specific task directly on the message card by clicking **"تم إنجاز المهمة"** (`resolveCommentMessageTask` in `commentEngine.js`).
  - **Bidirectional Sync**: Resolving a message task marks its linked entries in `user_actions_queue` as completed, and if all message tasks in the thread are completed, updates the parent thread's `isActionRequired` status.

### 23.6 Strict Target Audience Filtering & `GlobalCommentsDrawer` ("مركز المحادثات والمهام") Access Isolation
* **Default Target Audience (`isUserAuthorizedForTab`)**:
  - By default, when opening a comment thread, the target audience (`targetAudienceIds`) is initialized to **all users who have RBAC access to the target record/tab** (`isUserAuthorizedForTab` in `commentEngine.js`), respecting `cloudPermissions` (`userOverrides`), role defaults, and sensitive field permissions.
* **Strict Notification & Sidebar Isolation**:
  - Users who **do not have access** to the target tab/record or who are **unselected** from the target audience (`targetAudienceIds`) **never** receive in-app alerts, sound chimes, or push notifications (`postRecordComment` intersects `targetAudienceIds` with `authorizedUsers`).
  - In the **"مركز المحادثات والمهام"** (`GlobalCommentsDrawer.jsx`) sidebar and `CommentContext.jsx`, threads are strictly filtered by `isUserAuthorizedForTab`, `isSensitive`, and `targetAudienceIds` so unauthorized or excluded users cannot view restricted comments or records in the sidebar.

### 23.7 System-Wide Reusable Integration Across All 22+ Modules & Tabs
`<RecordCommentAction>` is integrated across all operational and master data modules:
1. **Master Data Module**: `ItemMaster.jsx`, `SupplierMaster.jsx`, `CategoriesMaster.jsx`, `FinishedProductsMaster.jsx`, `FGCategoriesMaster.jsx`, `BOMRecipesMaster.jsx`, `IntermediateBOMMaster.jsx`, `ProductionProcessesMaster.jsx`, `WarehouseMaster.jsx`, `SafesMaster.jsx`, `BankAccountsMaster.jsx`, `VehiclesMaster.jsx`, `ProductionWorkersMaster.jsx`, `UsersMaster.jsx`.
2. **Purchasing & Inventory Module**: `POCreation.jsx`, `GoodsReceipt.jsx`, `StockTransfers.jsx`, `StockBalances.jsx`, `StockCount.jsx`, `SparePartsConsumption.jsx`.
3. **Production & Manufacturing Module**: `WorkOrdersMaster.jsx`, `LiquidTanksMaster.jsx`, `FloorLiquidStorage.jsx`, `FaultyFGReturnMaster.jsx`, `FinishedGoodsInward.jsx`, `ProductionPerformanceReports.jsx`.
4. **Finance & Accounting Module**: `CashSafesMaster.jsx`, `CustodiesAdvancesMaster.jsx`, `DuesTrackingMaster.jsx`, `ChartOfAccountsMaster.jsx`, `PartnerStatementsMaster.jsx`, `FinancialStatementsMaster.jsx`.

---

## 24. Finance Dues & Installments Tracking, PO Advance Anti-Repayment & A4 Dual-Half WHT Certificates (`dues_tracking`)

### 24.1 Supplier Payment Terms with Advance Payment & Grace Period Allocation (`SupplierMaster.jsx`)
* Each Supplier defines `1..4` payment tranches (`paymentTerms.tranches`), where each tranche specifies:
  - `percent`: Percentage of total net value (`%`, validated so all tranches sum to `100%`).
  - `days`: Credit grace period in calendar days.
  - `baseDate`:
    - `'advance_payment'`: **Advance Payment upon PO / Before Delivery (`دفعة مقدمة عند أمر الشراء / قبل التوريد`)**.
    - `'delivery_date'`: **From Actual Supply / Return Date (`من تاريخ التوريد`)**.
    - `'end_of_month'`: **From End of Supply Month (`من نهاية شهر التوريد`)**.
* Both Purchase Orders (`POCreation.jsx`) and Goods Receipts / Returns (`GoodsReceipt.jsx`) inherit and snapshot `paymentTermsSnapshot` and `whtComplianceSnapshot` upon creation/update, falling back to the supplier's master payment terms for historical records.

### 24.2 Independent GRN (+) & RTN (-) Tranche Generation & PO Advance Anti-Repayment Protection (`DuesTrackingMaster.jsx`)
* **Independent Treatment of Returns (`RTN`)**:
  - Even when a Return Note (`RTN`) references a `linkedGrnId` for LOT and unit price tracking, each `RTN` is treated independently in the Dues Tracking schedule with its own Credit Note number (`creditNoteNumber`), return date (`receiptDate`), and negative `netPayable` tranches according to its VAT/WHT assignment.
* **PO Advance Payment & Immediate Anti-Repayment Upon GRN Receipt**:
  - Users can execute Advance Payments on approved unreceived or partially-received Purchase Orders (`PO-YYYYMMDDXX-ADV`), either from scheduled `'advance_payment'` tranches or ad-hoc.
  - **Immediate Anti-Repayment Deduction**:
    1. Any *paid* PO Advance is automatically linked via `poId` and deducted from incoming GRNs of that PO (`prePaidViaPoAdvanceAmount`), marking the corresponding GRN tranche amount as **"Pre-Paid via PO Advance (مخصوم تلقائياً من دفعة مقدمة لأمر الشراء)"** and immediately reducing its `remainingAmount` cap so the user can never repay what was already paid in advance.
    2. Any *unpaid* PO Advance portion is automatically absorbed into the GRN tranches upon receipt so the same value is never open twice.

### 24.3 Chronological Multi-Record Batch Payment Modal & Strict Overpayment Prevention
* **Strict Overpayment Prevention**:
  - Every positive tranche (`GRN` / `PO`) strictly enforces $0 < \text{Amount to Release} \le \text{Remaining Due}$. Attempting to enter an amount exceeding the remaining balance is immediately clamped and blocked with an inline warning.
* **Chronological Multi-Select Allocation**:
  - The Batch Payment Modal provides a multi-select dropdown of all unpaid/incomplete records (`GRN` tranches, `RTN` deductions, `PO` advances) for the selected supplier.
  - Selected records are rendered in a breakdown table **sorted chronologically by Due Date ascending**, showing read-only Due Date, read-only Net Remaining, and an editable **Amount to be Released (`المبلغ المراد صرفه / خصمه`)** field per row.
  - Users can reduce the released amount on any specific record or on the last (furthest due date) record to leave it **Partially Closed (`مغلق جزئياً`)**.
  - Supports **Cash Safe (`cash`)**, **Bank Transfer (`transfer`)**, and **Cheque (`cheque`)** sources with receipt attachments.

### 24.4 A4 Dual-Half 1% WHT Certificate Generator (`WhtNotePrintSlip.jsx`)
* Generated per taxable Invoice / Credit Note (`isTaxOfficial === true` and `totalWht > 0`) with sequential internal tracking (`WHT-YYYY-XXXX` in `wht_notes`).
* Prints on a single **A4 Portrait sheet divided into 2 identical horizontal halves separated by a dashed cut line (`✂`)**:
  - **First Half (Top — أصل الإشعار يسلم للمورد)**: Contains full statutory tax data (Supplier Legal Name, Tax Registration No., Tax File No., Tax Authority/District, Invoice/Credit Note No., Gross Subtotal, 14% VAT, 1% WHT in figures and Arabic Tafqeet, Net Payable) to be physically stamped and handed to the supplier.
  - **Second Half (Bottom — صورة الإشعار للحفظ)**: Contains identical data plus a dedicated **Supplier Receipt Acknowledgment (`إقرار استلام الأصل — توقيع وختم المورد`)** block to be signed/stamped by the supplier confirming receipt of the original certificate.

---

## 25. 100% Setup-Driven Financial Statements Engine, Vertical Balance Sheet & Multi-Level COA Hierarchy (`financial_statements` & `accounts`)

### 25.1 16-Column Setup-Driven Chart of Accounts Schema (`cashLedgerEngine.js` & `preconfiguredChartOfAccounts.js`)
Every account in `chart_of_accounts` is governed strictly by its explicit configuration with **zero hardcoded account code prefixes**:
- **16-Column CSV/Excel Schema (`COA_CSV_HEADERS`)**:
  `code, nameAr, nameEn, level, type, parentCode, statement, reportCategory, statementEffect, nature, cashFlowCategory, subType, requiresCostCenter, displayOrder, descriptionAr, descriptionEn`
- **Multi-Level Hierarchy (`level`: `1..5+`, `parentCode`)**:
  Supports 4+ levels of hierarchy (`L1` Root Headers -> `L2` Statement Groups -> `L3` General Ledger Control Accounts -> `L4+` Sub-Accounts). Any account (`main` or `sub`) can link to a `parentCode`. Self-parent loops (`parentCode === code`) are automatically sanitized.
- **Explicit Mathematical Effect (`statementEffect`: `'add'` vs `'deduct'`)**:
  Determines whether an account adds to (`+`) or deducts from (`-`) its assigned `reportCategory` section total, synced with its `nature` (`debit` / `credit`) relative to the section's `normalNature`. Contra-accounts (such as Accumulated Depreciation `10102` / `1010202`–`1010211` in `fixed_asset`, or Sales Returns/Discounts in `operating_revenue`) deduct cleanly from their section total and render in accounting parentheses `(amount)`.
- **Umbrella Section Headers (`reportCategory: 'section_header'`)**:
  Top-level structural roots (`1`, `2`, `3`, `302`, `4`, `401`) use `section_header` so they organize the COA tree without duplicating leaf rows inside statement sections.
- **Pre-Configured 127-Account Egyptian Unified COA (`preconfiguredChartOfAccounts.js`)**:
  Provides 1-click download of the pre-filled 16-column CSV/Excel sheet (`corrected_chart_of_accounts.csv`) and 1-click preview/sync directly inside `ChartOfAccountsMaster.jsx`.

### 25.2 Customizable Display Level Roll-Up & Vertical Balance Sheet (`FinancialStatementsMaster.jsx` & `FinancialStatementPrintSlip.jsx`)
- **Customizable Display Level Selector (`displayLevel`: `'summary' | '2' | '3' | '4' | 'all'`)**:
  Allows the user to control the depth of the Chart of Accounts displayed on the Income Statement and Balance Sheet (plus a `showZeroBalances` toggle).
  - Deeper child account balances and drilldown transactions roll up bottom-up (`computeRollupSectionItems`) into their visible parent account at the selected level with zero double-counting.
- **Vertical Balance Sheet Structure**:
  Both screen (`FinancialStatementsMaster.jsx`) and A4 Print Preview (`FinancialStatementPrintSlip.jsx`) render the Balance Sheet in a **Standard Vertical Report Table**:
  1. **Section I — Assets (`أولاً: الأصول`)**:
     - Fixed & Non-Current Assets (`fixed_asset`, net of contra-asset Accumulated Depreciation)
     - Current Assets (`current_asset`)
     - **`= Total Assets (إجمالي الأصول)`**
  2. **Section II — Liabilities & Shareholders' Equity (`ثانياً: الالتزامات وحقوق الملكية`)**:
     - Current Liabilities (`current_liability`)
     - Long-Term Liabilities (`long_term_liability`)
     - **`= Total Liabilities (إجمالي الالتزامات)`**
     - Shareholders' Equity (`equity`) + Prior Periods Retained Net Income (`priorRetainedNetIncome`) + Current Period Net Income (`periodNetIncome`)
     - **`= Total Liabilities & Equity (إجمالي الالتزامات وحقوق الملكية)`**
- **Strict Scope Enforcement & Cumulative vs. Periodic Horizons**:
  - Scope (`Official / Standard` vs `Master / Consolidated`) is enforced strictly at the posted transaction/journal entry level (`status === 'posted'`), including double-entry legs for Cash Safes (`accountingLinks.cashSafesAccount`) and Corporate Banks (`accountingLinks.corporateBanksAccount`).
  - **Balance Sheet**: Cumulative balances up to `endDate`.
  - **Income Statement & Cost Centers**: Periodic balances within `[startDate, endDate]`.

### 25.3 Income Statement Section Architecture & Operating Profit (`FinancialStatementsMaster.jsx` & `FinancialStatementPrintSlip.jsx`)
The Income Statement (P&L) is structured to reflect true operating profitability including all operating overheads and banking/financing charges:
1. **Section 1 — Operating Revenue (`إيرادات النشاط التشغيلي والمبيعات`)**: `operating_revenue` accounts.
2. **Section 2 — Cost of Goods Sold (`تكلفة المبيعات والتكاليف المباشرة للإنتاج — COGS`)**: `cogs_direct` accounts.
   - **`= Gross Profit (مجمل الربح)`** = Section 1 - Section 2.
3. **Section 3 — Selling & Distribution Expenses (`المصروفات البيعية والتسويقية والتوزيع`)**: `selling_expense` accounts.
4. **Section 4 — General & Administrative Expenses (`المصروفات العمومية والإدارية`)**: `admin_expense` accounts.
5. **Section 5 — Financing & Bank Expenses (`المصروفات التمويلية والعمولات البنكية`)**: `financing_expense` accounts.
   - **`= Operating Profit (صافي الربح التشغيلي للنشاط)`** = Gross Profit - (Section 3 + Section 4 + Section 5).
     - Operating Margin % = `(Operating Profit / |Operating Revenue|) * 100`.
6. **Section 6 — Other Non-Operating Revenue / Expense (Net) (`إيرادات ومصروفات أخرى غير تشغيلية`)**: `other_revenue_expense` accounts.
   - **`== Net Income / (Loss) Before Tax (صافي ربح / خسارة الفترة قبل الضريبة)`** = Operating Profit + Section 6.
Both on-screen table (`FinancialStatementsMaster.jsx`), CSV export, and A4 Print Preview (`FinancialStatementPrintSlip.jsx`) follow this unified sequence.

### 25.4 Universal Parent Rollup, Strict Child Account Adherence & Hierarchical Distinction (`TrialBalance`, `cashLedgerEngine.js`)
- **Strict Child Account Adherence Everywhere**:
  Whenever a cash voucher, journal entry, or accrual targets an analytical child account (e.g. `4010201`), the posting engines and sub-ledger resolvers record and preserve that specific child code. All report aggregators (Trial Balance, P&L, Balance Sheet, Ledger drilldowns) adhere strictly to the analytical child account without prematurely collapsing to the parent control account.
- **Universal Parent Account Rollup**:
  All parent accounts on the Trial Balance (`40102`, `401`, `4`) automatically compute and display the bottom-up sum of their child accounts across all financial metrics: Opening Balance, Period Debit, Period Credit, and Closing Net Balance.
  - **Zero Double-Counting**: Grand totals sum leaf accounts only, guaranteeing 100% mathematical equality ($\sum \text{Debit} = \sum \text{Credit}$) and zero duplicate counting.
- **Hierarchical Visual Distinction Without Row Colors**:
  The Trial Balance uses clean typographical and architectural hierarchy rather than colored row backgrounds:
  - Indentation scaling: `(level - 1) * 20px`.
  - Outline badges: `L1` (Root), `L2` (Group), `L3` (Control), `L4+` (Sub-Account).
  - Tree branch glyphs: `├──` (middle child), `└──` (last child).
  - Section dividers (`border-t-2 border-slate-300`) and typographic weight differentiation.
- **Double-Entry Breakdown Leg Resolution**:
  - **Safe Leg**: Displays the source vault/bank name and safe ID (`subledgerName: safeDoc.nameAr`).
  - **Counter Leg**: Explicitly shows **both GL Control Account and Sub-Account** (e.g. `40102` with `↳ 4010201`, `إيرادات أخرى` with `↳ إيراد بيع توالف وهوالك`, subledger `[4010201] إيراد بيع توالف وهوالك`) across both drawer view and official A4 Journal Voucher print slips.

---

## 26. Relational Cascade Purge & Master Data Immunity Engine (`AdminControlPanel.jsx` — `factory_reset`)

### 26.1 4-Tier Structured Purge Selector (`PURGE_TARGETS_CATALOG`)
The Database Purge & Factory Reset sub-tab (`#admin_panel?subTab=factory_reset`) is structured into 4 clear tiers aligned 100% with the actual Firestore collections and cross-collection auto-generated records:
1. **Tier 1 — Recommended Full Operational Wipe (`operational_only`, Default)**:
   - Wipes all 28 operational/transactional collections (`OPERATIONAL_COLLECTIONS_REGISTRY`) while enforcing a triple-layer immunity lock on all 19 Master Data & Configuration collections (`MASTER_COLLECTIONS_REGISTRY`, including `chart_of_accounts`, `system_config`, `users`, `items`, `suppliers`, `clients`, `warehouses`, `cash_safes`, `corporate_banks`, `floor_liquid_vessels`, etc.).
   - Resets transient operational balances to `0` (`items.stock`, `cash_safes.currentBalance` & `denominations`, `corporate_banks.currentBalance`, and `floor_liquid_vessels.currentVolume` / `activeTanks`) while 100% preserving all master definitions and capacities.
2. **Tier 2 — Targeted Operational Table + Smart Relational Cascade (`category: 'operational'`)**:
   - Allows wiping a specific operational module (`goods_receipts`, `purchase_orders`, `transfers`, `stock_count`, `spare_parts_issue`, `liquid_tanks`, `work_orders`, `fg_inward`, `faulty_fg`, `cash_transactions_hub`, `dues_tracking`, `journal_entries_only`, `opening_balances_only`, `all_inventory_movements`, `comments_and_notifications`).
   - **Selective Cross-Collection Cascade**: Uses predicate filters to selectively delete only the auto-made records in related collections (`stock_ledger`, `stock_transfers`, `production_transformations`, `journal_entries`, `cash_transactions`, `dues_settlements`, `wht_notes`, `record_comments`, `user_actions_queue`, `system_notifications`) that were generated by that target table—without wiping unrelated records in those shared collections.
   - **Dynamic Post-Purge Balance Recalibration**:
     - `recalcItemsStock`: Dynamically recalculates `items.stock` and `variations[].stock` from remaining `stock_ledger` entries rather than blindly zeroing stock.
     - `recalcSafesAndBanks`: Dynamically recalculates `cash_safes` and `corporate_banks` balances from remaining posted `cash_transactions`.
     - Relational state cleanup: resets `receivedQty` on POs when GRNs are wiped; unlinks `poId` on GRNs when POs are wiped; resets `staged_floor_pallets` to `staged_on_floor` when FG Inward transfers are wiped.
3. **Tier 3 — Specific Master Data Table Reset (`category: 'master'`)**:
   - Clearly isolated for General Admin use when resetting a specific Master collection (`master_items`, `master_suppliers`, `master_clients`, `master_finished_products`, `master_boms_and_processes`, `master_warehouses_and_vessels`, `master_safes_and_banks`, `master_chart_of_accounts`, `master_workers_and_vehicles`).
4. **Tier 4 — Full Factory Reset (`all`)**:
   - Wipes both operational and master collections across the entire ERP.

---

## 27. Universal Company Profile Single Source of Truth (SSOT) & Document Letterhead Architecture (`#system_config` & `useCompanyProfile`)

### 27.1 Core SSOT Principle: Zero Hardcoded Company Names
To ensure absolute legal and brand consistency across all company documents, no hardcoded company names, addresses, commercial registry numbers, or tax registration IDs are permitted anywhere in the application code.

Every printable document, slip, export, and letterhead MUST derive its company profile dynamically from:
- **Firestore Collection**: `system_config`
- **Document ID**: `company_profile`
- **Primary Accessor Hook**: `useCompanyProfile()` in `src/hooks/useCompanyProfile.js`

### 27.2 Standard Company Profile Schema (`companyProfile`)
Managed live via `#system_config` (`SystemConfigMaster.jsx`):
- `tradeNameAr`: Arabic trade name
- `tradeNameEn`: English trade name
- `legalName`: Full legal corporate name
- `taxCardNumber`: 9-digit tax registration card number
- `commercialRegister`: Commercial registry number (السجل التجاري)
- `taxDistrict`: Competent corporate tax district
- `registeredAddress`: Official corporate headquarters address

### 27.3 Mandatory Letterhead Implementation Standard
Whenever rendering any printable slip, modal preview, or Excel/CSV export header:
1. Import `useCompanyProfile` from `../hooks/useCompanyProfile` (or appropriate relative path).
2. Derive localized display name:
   ```javascript
   const { companyProfile } = useCompanyProfile();
   const companyName = isAr
     ? (companyProfile.tradeNameAr || companyProfile.legalName)
     : (companyProfile.tradeNameEn || companyProfile.legalName);
   ```
3. Render BiDi-isolated tax card: `<VatNumberDisplay value={companyProfile.taxCardNumber} />`.
4. Display registered address and commercial register dynamically.

### 27.4 Covered Printouts & Documents Registry (100% Unified)
- **Finance & Treasury**: `CashVoucherPrintSlip.jsx`, `FinancialStatementPrintSlip.jsx`, `TrialBalancePrintSlip.jsx`, `JournalVoucherPrintSlip.jsx`, `PartnerStatementPrintSlip.jsx`, `CustodyAcknowledgmentPrintSlip.jsx`, `WhtNotePrintSlip.jsx`, `FinancialStatementsMaster.jsx` (CSV/Excel).
- **Procurement & Warehousing**: `POCreation.jsx`, `GoodsReceipt.jsx`, `GoodsReceiptPrintSlip.jsx`, `StockTransfers.jsx`, `StockTransferPrintSlip.jsx`, `StockBalances.jsx` (Kardex print slips), `StockCount.jsx` (Inventory count sheets).

---

## 28. Tri-Surface Navigation Alignment Standard (Home Page, Sidebar & Top Navbar)

### 28.1 The Alignment Imperative
The ERP provides three primary navigational surfaces:
1. **Home Page Hub (`LandingPage.jsx`)**: Module cards with interactive tab chips and default tab selection dropdowns.
2. **Sidebar Navigation (`App.jsx` — `MODULE_NAV_DEFINITIONS`)**: Persistent left/right collapsible dock displaying the current module's active tabs.
3. **Top Navbar Breadcrumbs Droplist (`TopNavbar.jsx` — `RAW_ERP_STRUCTURE`)**: Header breadcrumbs dropdown providing quick switching between operational modules and their underlying workspaces/subtabs.

To eliminate user confusion, all three surfaces MUST remain 100% synchronized with identical tab IDs, permission module keys, localized labels, icons, default orders, and subtab routes.

### 28.2 Standard Operational Module Registry
- **Master Database (`master_data` - 17 Tabs)**:
  1. `items` (Item Master)
  2. `suppliers` (Supplier Master)
  3. `clients` (Client Master)
  4. `client_segments` (Client Segments & Categories)
  5. `categories` (Raw Material Categories)
  6. `finished_products` (Finished Goods Master)
  7. `finished_product_categories` (FG Categories & Lines)
  8. `bom` (Packing & Filling BOM)
  9. `intermediate_bom` (Intermediate Recipes)
  10. `production_processes` (Production Processes & SOPs)
  11. `warehouses` (Warehouses Master)
  12. `safes` (Safes & Cash Vaults)
  13. `bank_accounts` (Bank Accounts Master)
  14. `vehicles` (Vehicles & Fleet Master)
  15. `production_workers` (Production Workers)
  16. `users` (Users & Roles)
  17. `system_config` (System Configuration)
- **Materials & Procurement (`purchases` - 6 Tabs)**:
  1. `orders` (Purchase Orders)
  2. `receipts` (Goods Receipt GRN)
  3. `transfers` (Stock Transfers TRN)
  4. `stock` (Stock Balances & Kardex)
  5. `stock_count` (Stock Count & Variances)
  6. `spare_parts` (Spare Parts Issue)
- **Production & Manufacturing (`production` - 6 Tabs)**:
  1. `work_orders` (Work Orders: Plan, Today's Pallet Production, Live Shift)
  2. `liquid_tanks` (Bulk Liquid Tanks M)
  3. `liquid_storage` (Floor Liquid Storage & Bulk Flow)
  4. `faulty_fg` (Faulty FG & Returns)
  5. `fg_inward` (Finished Goods Inward)
  6. `production_reports` (Production & Performance Reports)
- **Finance, Accounts & Treasury (`finance` - 6 Tabs)**:
  1. `cash_safes` (Cash Safes & Vaults: Safes Hub, Custodies & Advances)
  2. `banks` (Bank Accounts & Cheques: Bank List, Cheques Ledger, Reconciliation)
  3. `dues_tracking` (Dues & Installments: Suppliers AP, Clients AR)
  4. `party_statements` (Partner Statements: Supplier Statements, Client Statements)
  5. `accounts` (Chart of Accounts & GL: COA Tree, Journal Entries, Trial Balance)
  6. `financial_statements` (Financial Statements: P&L Income Statement, Vertical Balance Sheet, Cash Flow)
- **Sales & Distribution (`sales` - 4 Tabs)**:
  1. `sales_orders` (Sales Orders & Supply Orders)
  2. `loading_plan` (Loading & Delivery Plan Execution)
  3. `price_lists` (Price Lists & Pricing Policies)
  4. `client_contracts` (Client Contracts & Discounts)

### 28.3 Dynamic Order & Appearance Recalibration (`tabAppearanceConfig.js`)
All three navigation surfaces map their base tab definitions through `tabConfigs[tab.id]` and sort using `(Number(tab.order) || 99)`.
`DEFAULT_TABS_CONFIG` serves as the baseline fallback order, preventing any duplicate order numbers or dropped tabs across sessions.

---

## 29. Client Master & Dynamic Market Segmentation Architecture (`#clients` & `#client_segments`)

### 29.1 Client Segments Master (`ClientSegmentsMaster.jsx` — `client_segments`)
- **Collection**: `client_segments`
- **Purge Status**: Master Data Immunity Lock (automatically registered via `modules.master_data.tabs.client_segments`).
- **Core Entity Attributes**:
  - `id`: Unique slug/code (e.g. `seg_chains`, `seg_wholesalers`).
  - `nameAr`: Arabic title (e.g. `سلاسل تجارية / كبرى`).
  - `nameEn`: English title (e.g. `Chains & Modern Trade`).
  - `color`: Hex color code with live Tailwind visual tag.
  - `icon`: Selectable Lucide icon from curated 55-icon registry organized into categories:
    - **Food & Dining (19 icons)**: `Utensils`, `UtensilsCrossed`, `ChefHat`, `Coffee`, `CupSoda`, `Pizza`, `Sandwich`, `Soup`, `Salad`, `Cake`, `Cookie`, `Croissant`, `Apple`, `Wheat`, `Fish`, `Beef`, `Egg`, `Milk`, `IceCream`.
    - **Shipping & Logistics (15 icons)**: `Truck`, `Ship`, `Plane`, `Container`, `Anchor`, `Warehouse`, `Factory`, `Package`, `PackageCheck`, `PackageOpen`, `Boxes`, `Bike`, `MapPin`, `Compass`, `Navigation`.
    - **Retail & Corporate (21 icons)**: `Building2`, `Store`, `ShoppingBag`, `ShoppingCart`, `Hotel`, `Globe`, `Building`, `Landmark`, `School`, `HeartPulse`, `Crown`, `Award`, `BadgePercent`, `Receipt`, `Gift`, `Target`, `Users`, `Briefcase`, `UserCheck`, `Tag`, `Layers`.
  - `displayOrder`: Sorting order.
- **Categorized Icon Selector**: Interactive category filter tabs in the segment creation/edit modal with live count badges, localized tooltips, and responsive grid.
- **Pre-Seeded Default FMCG Segments**: One-click initialization for 7 standard FMCG distribution channels:
  1. *سلاسل تجارية / كبرى* (`Building2`, `#2563eb`)
  2. *جملة* (`Boxes`, `#059669`)
  3. *نصف جملة* (`Store`, `#0d9488`)
  4. *تجزئة* (`ShoppingBag`, `#0891b2`)
  5. *موزعين* (`Truck`, `#7c3aed`)
  6. *فنادق ومطاعم / HORECA* (`Hotel`, `#d97706`)
  7. *تصدير* (`Globe`, `#dc2626`)
- **Safety Lock**: Deleting a segment is blocked if active clients are currently assigned to it (`getLinkedClientsCount > 0`).

### 29.2 Client Master Directory (`ClientMaster.jsx` — `clients`)
- **Collection**: `clients`
- **Dynamic Segment Subscription**: Client cards and dropdowns consume `client_segments` in real-time, rendering custom color badges and matching icons.
- **Delivery-Bound Latest Activity (`latestActivityOn`)**:
  - Replaced static active/inactive toggles with `latestActivityOn`.
  - **Rule**: Strictly updated upon sales order delivery. Brand new clients display *"لا يوجد نشاط تسليم مسجل بعد"*.
- **Credit Limit Semantics (`creditLimit`)**:
  - `creditLimit: 0` (Default) $\rightarrow$ Explicitly represents **No Credit Limit / Unlimited ("حد ائتماني غير مقيد / مفتوح")**.
  - `creditLimit > 0` $\rightarrow$ Represents active monetary cap in EGP.
- **De-Duplication Engine (Empty Fields Exclusion)**:
  - Real-time duplicate validation excludes empty/whitespace fields:
    - 9-digit tax card (`taxCardNumber`) normalized match against existing non-empty tax cards.
    - Phone and mobile numbers checked across primary contacts and all sub-branches.
    - Arabic and English trade names string similarity match.
  - Blank optional fields never falsely collide.
- **Multi-Branch Hierarchy (`branches` Array)**:
  - Supports single-branch (auto-generates "الفرع الرئيسي") or multi-branch architectures.
  - Each branch carries: `nameAr`, `nameEn`, `isMain`, `region`, `address`, `contactPerson`, `phone`, `mobile`, `gpsCoordinates` (direct Google Maps link).
  - Expandable drawer in main directory table.
- **Bulk CSV Import & Export**:
  - Downloadable 18-column CSV template (`tawoos_clients_import_template.csv`).
  - Client-side parser cross-checks against live Firestore DB and internal CSV rows for duplicates.
  - Visual preview table tagging rows as Valid (green) vs. Duplicate/Conflict (red with exact reason) prior to commit.
- **Cross-App Comments**: Integrated via `<RowCommentButton tab="clients" module="master_data" />`.

---

## 30. Zero Component Header Duplication Architecture (Page Header Banner SSOT)

### 30.1 Background & Root Cause
In earlier iterations of the web application, individual tab views (`*Master.jsx`) frequently rendered internal top-level header containers featuring an icon, an `<h1>` or `<h2>` tab title, and a subtitle description. 
With the introduction of `TabPageHeaderBanner.jsx` dynamically rendered in `App.jsx` for all operational and master tabs (`activeTab !== 'landing' && activeTab !== 'admin_panel'`), this resulted in a visually redundant "double-header container" where the tab identity was displayed twice in succession.

### 30.2 Architectural Standard & Mandate
1. **Single Source of Truth (SSOT)**: `TabPageHeaderBanner.jsx` is the sole, authoritative visual banner for every tab screen. It provides:
   - Atmospheric watercolor tint and glow matching the tab's configured color (`tabAppearanceConfig.js`).
   - Dynamic tab icon, category tag pill, and `#tabId` badge.
   - Screen title with full bilingual localization.
   - Administrative action triggers ("صلاحيات التبويب" Scoped Permissions & "تخصيص مظهر التبويب" Customizer).
2. **Tab Component Content Boundary**:
   - Individual tab components (`src/components/*.jsx`) must **NEVER** render an internal title box, hero card, or container that duplicates the tab's name, icon, or description.
   - All primary tab-level action buttons (e.g. "إضافة ... جديد", "استيراد CSV", "تصدير", filter selectors, view switchers) must reside cleanly in the **Search & Filter Action Ribbon**.
3. **Audited & Compliant Tab Views**:
   - **Master Data**: `ItemMaster`, `SupplierMaster`, `ClientMaster`, `ClientSegmentsMaster`, `CategoriesMaster`, `FinishedProductsMaster`, `FGCategoriesMaster`, `BOMRecipesMaster`, `IntermediateBOMMaster`, `ProductionProcessesMaster`, `WarehouseMaster`, `SafesMaster`, `BankAccountsMaster`, `VehiclesMaster`, `ProductionWorkersMaster`, `UsersMaster`, `SystemConfigMaster`.
   - **Purchases & Inventory**: `POCreation`, `GoodsReceipt`, `StockTransfers`, `StockBalances`, `StockCount`, `SparePartsConsumption`.
   - **Production**: `WorkOrdersMaster`, `LiquidTanksMaster`, `FloorLiquidStorage`, `FaultyFGReturnMaster`, `FinishedGoodsInward`, `ProductionPerformanceReports`.
   - **Finance**: `CashSafesMaster`, `DuesTrackingMaster`, `ChartOfAccountsMaster`, `PartnerStatementsMaster`, `FinancialStatementsMaster`.
   - **Sales**: `SalesOrdersMaster`, `SalesLoadingPlanMaster`, `PriceListsMaster`, `ClientContractsMaster`.

---

## 31. Sales & Commercial Module Architecture (`sales_orders`, `loading_plan`, `price_lists`, `client_contracts`)

### 31.1 Tri-Surface Synchronized Navigation Alignment
The Sales & Distribution module (`sales`) is fully synchronized across all three ERP navigation surfaces adhering strictly to Section 28:
1. **Home Page Hub (`LandingPage.jsx`)**: Active module card with interactive tab chips for `sales_orders`, `loading_plan`, `price_lists`, and `client_contracts`.
2. **Sidebar Navigation (`App.jsx` — `MODULE_NAV_DEFINITIONS.sales`)**: Dock with dedicated navigation buttons, dynamic tab appearance badges, and permissions filtering.
3. **Top Navbar Breadcrumbs Droplist (`TopNavbar.jsx` — `RAW_ERP_STRUCTURE`)**: Dynamic header dropdown reflecting all 4 tabs with matching icons, permissions, and localized titles.
4. **Appearance & Order Registry (`src/utils/tabAppearanceConfig.js` — `DEFAULT_TABS_CONFIG`)**:
   - `sales_orders` (Order 1, `#059669`, `ShoppingCart`)
   - `loading_plan` (Order 2, `#2563eb`, `Truck`)
   - `price_lists` (Order 3, `#d97706`, `BadgeDollarSign`)
   - `client_contracts` (Order 4, `#0284c7`, `Handshake`)

---

### 31.2 Dedicated Dispatch & Loading Plan Tab (`SalesLoadingPlanMaster.jsx` — `loading_plan`)
To prevent visual clutter in the Sales Orders master directory, dispatch execution and delivery scheduling are decoupled into a dedicated, clean tab:

#### 1. Compound Alignment Validation by `(loadingDate + loadingOrderNumber)`
- **Domain Rule**: Loading Order numbers (`loadingOrderNumber`, e.g. #1, #2) reset each calendar day.
- **Validation Mechanics**: Conflicting truck/driver assignments are evaluated compoundly against `(loadingDate + loadingOrderNumber)`. LO #1 on Nov 10 and LO #1 on Nov 11 are completely independent and valid.
- If discordant vehicles or drivers are assigned to the same LO # on the same date, the system triggers a warning: `⚠️ تعارض في أمر تحميل #X بتاريخ (YYYY-MM-DD)` and provides a 1-click **"مطابقة وتوحيد كافة الطلبات / Align All Orders"** action.

#### 2. Target Planning Date & Date Scopes
- A dedicated **Target Planning Date (`تاريخ التحميل المستهدف`)** picker in the top ribbon anchors all new assignments and validates against it.
- **Scope Presets**: `اليوم / Today` (default), `غداً / Tomorrow`, `خلال 7 أيام / Next 7 Days`, and `تاريخ مخصص / Custom Scope`.
- Live telemetry badge calculating total orders, total cartons, and total weight (tons) within the selected scope.

#### 3. Animated 80/20 & 20/80 Space-Saving Cards
- **Single Active Card**: Only one card can be in editing mode at any time, maintaining clean screen ergonomics.
- **Editing Mode (`isEditing === true`)**:
  - Transition extends smoothly from the click origin (`duration-700 ease-out origin-right rtl:origin-left`).
  - Order details compress to **20%** width (Client, Branch, Cartons, Weight).
  - Ultra-compact single-row assignment panel takes **80%** width. Bulky header/footer containers are removed.
  - **Expanding Hover Action Buttons**:
    - `Check` icon expands smoothly on hover to `حفظ` (`Save`).
    - `X` icon expands smoothly on hover to `إلغاء` (`Cancel`).
    - `RotateCcw` icon expands smoothly on hover to `مسح` (`Clear`).
- **Assigned & Closed Mode (`isAssigned && !isEditing`)**:
  - Order details take **80%** width with per-product quantity summary chips (`[صنف: X ك]`).
  - Right strip takes **20%** width with a compact **2x2 summary grid** (`🚚 #LO`, `Plate`, `Driver`, `Rep`).
- **Unassigned & Closed Mode (`!isAssigned && !isEditing`)**:
  - Full-width card with a slim `+ تسكين` button on the end strip.

#### 4. Fleet Capacity & Load Optimization Gauges
- Integrated vehicle payload limits: `minCapacityKg`, `optimumCapacityKg`, `maxCapacityKg`.
- Manifest dock displays per-truck load indicators (`مؤشر الحمولة`):
  - Blue (`حمل خفيف`): Weight is below minimum threshold.
  - Emerald (`حمولة مثالية`): Weight is within optimum range.
  - Rose (`حمولة زائدة`): Weight exceeds maximum safety limit.

#### 5. Map Location Pin vs Search Fallback
- **Accurate Saved Coordinates**: Displays green `Map` icon (`الموقع مسجل`) opening exact GPS coordinates in Google Maps.
- **Search Fallback**: If coordinates are missing, displays composite `MapPin + Search` in pale yellow (`bg-amber-50/90 text-amber-800 border-amber-200/90`) with label `بحث على الخريطة`. Hidden if accurate GPS coordinates exist.

#### 6. RBAC, Scoped Permissions & Atomic Persistence
- **Action Authority**: Evaluated via `canAccessAction(permissions, 'loading_plan', 'canManageLoadingPlan', currentUser)`.
- **Cascade Compliance**: If `modules.loading_plan === false` in Scoped Permissions, all editing triggers and buttons are disabled.
- **Atomic Commits**: Dispatches saved via Firestore `writeBatch` updating `sales_orders` documents and writing immutable audit trail entries (`action: 'dispatch_plan_update'`).

---

### 31.3 Fleet Dashboard, Corporate Fulfillment Progression & Bidirectional Sync (`SalesOrdersMaster.jsx` & `SalesLoadingPlanMaster.jsx`)
- **Primary Vehicle Identity & Quick Copy**: Displays vehicle display name (`resolveVehicleDisplayName`) as the primary fleet identifier with 1-click copy chips for truck `plateNumber` and Purchase Order numbers (`PO #`).
- **5-Stage Fulfillment Status Progression**: Unified styling and RTL/LTR directional gradients (`SALES_FULFILLMENT_STYLE_MAP`) across `not_yet` (Pending), `prepare` (Preparing), `shipped` (Dispatched), `delivered` (Delivered), and `paid` (Paid/Settled).
- **Fleet Trips Carousel & Conflict Alignment**: Collapsible Trucks Fleet Dashboard in `loading_plan` with 3-slot trip carousel, light hover tooltips, bidirectional middle stepper controls, LO# conflict detection (`loadingOrderNumber`), and conflict filtering.
- **Trip-Scoped Floating Manifest & Deep-Linking**: Floating manifest dock scopes dynamically to active triggered trips; bidirectional hash navigation links specific order rows between `sales_orders` and `loading_plan` while preserving full `RecordCommentAction` threads (`Section 23`).
- **Tonnage Unit Standard**: Arabic UI labels consistently render `طن` (never `t`).

---

### 31.4 Order Splitting Engine & Portions Directory (`OrderSplitModal.jsx`)
- **Eligibility & Guidance Gate**: Strictly restricted to `Pending` (`fulfillmentStatus === 'not_yet'`) orders; clicking Split on `Preparing+` orders guides the user to revert status to `Pending` first. Guarded by `canSplitOrder`.
- **Interactive Truck Allocation Matrix**: Splits products/quantities into numbered child portions (`#0001 (1/3)`, `#0001 (2/3)`, ...) with real-time per-SKU sum validation against the parent baseline.
- **Consolidated Financial Mode (`splitMergeInvoices`)**: When billing/financial documents are configured to remain merged, `SalesOrdersMaster` renders the parent order as a single unified card displaying an expandable **Split Order Portions Directory** with per-portion fulfillment badges and hover product breakdown tooltips, while `SalesLoadingPlanMaster` dispatches each child portion independently onto trucks.
- **Full Split Reallocation & Unsplit**: Supports editing an existing split structure (adding/removing trips, reallocating quantities, or unsplitting back into a single unified order) atomically via Firestore batch writes.

---

### 31.5 Post-Dispatch Partial Rejection & Quantity Sync (`SalesOrderEditorModal` & `salesOrderUtils.js`)
- **Authorized Post-Dispatch Adjustment (`canAdjustDispatchedQuantities`)**: Enables designated users to adjust quantities on already-dispatched (`shipped`, `delivered`, `paid`) orders to record client partial refusals (`returnedQty`, `returnedBonus`, `returnedCartons`, `returnedWeightKg`).
- **Immutable Baseline Snapshot & Force Sync**: Captures `preAdjustmentSnapshot` on initial adjustment, force-syncs net client invoice totals and warehouse return metrics, logs granular per-line diffs in `auditTrail`, and provides `openPrintableAdjustmentSlip` for warehouse & accounting reconciliation.

---

### 31.6 Retail Van-Sales Route Settlement & Standard Retail Load List (`RetailSettlementModal.jsx` & `StandardRetailListModal.jsx`)
- **Retail Route Auto-Detection & Override**: Automatically detects Retail segment orders (`isRetailSegmentRecord` / `isOrderRetailRoute`) with per-order `isRetailRouteOverride` toggle in `SalesOrderEditorModal` (plus `SearchableSelect` delivery branch picking).
- **Global Standard Retail Load List (`system_config/retail_standard_load_list`)**:
  - Configured once from a non-prominent toolbar button (`Std Retail List`) opening `StandardRetailListModal.jsx`, guarded by `canManageStdRetailList`.
  - Stores default SKUs, carton `qty`, and optional `bonus`. On Retail sales orders, the **Std Retail List** button populates lines via `buildOrderLineFromProduct` (resolving 8-tier pricing, promotional discounts, VAT/WHT, weights, and `isProductAllowedForClient` checks), prompting before overwriting existing lines while keeping every populated quantity editable per trip/branch.
- **Post-Arrival Retail Settlement & User Notification (`canSettleRetailOrders`)**:
  - `RetailSettlementModal` reconciles loaded truck baseline against actual confirmed sold quantities and unsold warehouse returns, displaying live product breakdowns, buyer proof uploads (`retailSettlementAttachments`), printable trip settlement slips (`openPrintableRetailSettlementSlip`), and Force-Sync revision tracking (`retailSettlementRevision`).
  - Upon settlement or Force-Sync commit, `createNotification` directly alerts relevant Sales, Warehouse, Accounting, and Admin users with sold/returned cartons (`طن`) and settled invoice totals—without intermediate pending-acknowledgment buttons or states.

---

## 32. Finished Goods Stock Balances Overview & SSOT Engine (`fg_balances` & `fgStockEngine.js`)

### 32.1 Architecture & Tab Integration
- **Navigation Surface**: Registered under Production & Manufacturing (`production.tabs.fg_balances`) right after `fg_inward` across `appArchitecture.js`, `tabAppearanceConfig.js`, `App.jsx`, `LandingPage.jsx`, `TopNavbar.jsx`, `notificationEngine.js`, and `commentEngine.js`.
- **View Component**: `src/components/FgBalancesMaster.jsx` provides a read-only SSOT inventory dashboard with KPI strip, multi-criteria filtering (search, production line category, brand ownership, stock health, inactive toggle), expandable SKU drill-downs (per-packaging option `A/B` lot traceability + active `prepare` sales orders), `<RowCommentButton>` threads, CSV export (`canExport`), and an interactive filterable/printable Movement Kardex modal (`canViewKardex`, `canPrint`).
- **Units Policy**: Displays strictly Cartons (`كرتونة`) and Small Base Units (`عبوة`). Weight / Tons (`طن`) columns are omitted here (reserved for fleet/truck payload planning).

### 32.2 Single Source of Truth (SSOT) Physical Balance & Pipeline Formula
Implemented centrally in `src/utils/fgStockEngine.js` (`buildFgStockMatrix`, `buildFgProductKardex`) and shared by both `FgBalancesMaster.jsx` and `FinishedProductsMaster.jsx` (`liveStockMap`):
1. **Physical FG On-Hand**:
   - **`(+)` Opening Balance**: Ingested directly from `finished_products[].packagingOptions[]` (`openingQtySmall`, `openingQtyLarge`, `openingBatchNo`, `openingProdDate`, `openingExpDate`, `openingWarehouse`). Note: `goods_receipts` is dedicated exclusively to raw/packaging materials; `FinishedProductsMaster.jsx` preserves saved OB fields on edit and no longer generates redundant `OB-FG-*` docs into `goods_receipts` or `stock_ledger`.
   - **`(+)` Accepted Production Pallets**: `staged_floor_pallets` where `status === 'transferred_to_fg' || status === 'accepted_in_fg' || stagingStatus === 'transferred_to_fg'`.
   - **`(+)` Commercial Sales Returns**: `sales_orders` where `['return_deduct', 'return_no_deduct'].includes(orderType)`, `['delivered', 'paid'].includes(fulfillmentStatus)`, `!isSplitParent`, and `confirmationStatus !== 'canceled'`.
   - **`(-)` Faulty FG Warehouse Pulls**: `faulty_fg_returns` where `sourceType === 'fg_warehouse' && status !== 'cancelled' && status !== 'rejected'` (supporting both `items[]` and legacy root fields).
   - **`(-)` Dispatched Sales Orders**: `sales_orders` where `['supply', 'replacement_old', 'exchange'].includes(orderType)`, `['shipped', 'delivered', 'paid'].includes(fulfillmentStatus)`, `!isSplitParent`, and `confirmationStatus !== 'canceled'` (summing net `lines[].qty + lines[].bonus`).
2. **Non-Deducted Commitments & Inward Pipeline**:
   - **Preparing / Committed (`prepare`)**: Physical outbound `sales_orders` in `fulfillmentStatus === 'prepare'`; drives **`Net Available = Physical On-Hand - Preparing`**.
   - **Pending Custodian Inward**: `stock_transfers` with `status === 'pending_custodian_verification'` targeting FG receipts (`TRN-FG-*` / `transferType === 'finished_goods'`).
   - **Staged on Floor**: `staged_floor_pallets` with `status === 'staged_on_floor' && !isWaitingMaterials` (excluding pallets already queued inside pending custodian transfers).
3. **Weighted Average Cost Valuation & RBAC Masking**:
   - Aggregates pallet cost (`palletTotalCost` / `costPerSmall` / `costPerLarge`) to derive `avgCostPerSmall`, `avgCostPerLarge`, and `stockValue`. Masked (`••••`) unless `canAccessField(permissions, 'fg_balances', 'unitCost' | 'totalValue', currentUser)` is granted.

### 32.3 Loading Plan FG Stock & Deficit Intelligence Sidebar (`LoadingPlanFgSidebar.jsx`)
- **Persistent Opposite-Edge Drawer**: Mounted inside `SalesLoadingPlanMaster.jsx` on the `end-0` viewport edge (`fixed end-0 inset-y-0 z-40`), opposite the main navigation sidebar, defaulting to collapsed with a slim vertical trigger tab displaying a live red `deficitSkuCount` badge.
- **Forecast Engine (`buildLoadingPlanFgForecast` in `src/utils/fgStockEngine.js`)**:
  - **Same-Day Opening vs Live Current Balance (`targetPlanningDate <= todayStr`)**: When no outbound orders have been dispatched on `targetPlanningDate`, `openingCartons` equals Live Physical FG On-Hand from `buildFgStockMatrix`. Once one or more outbound orders are dispatched on `targetPlanningDate`, `openingCartons` reflects the previous day's closing balance (`endDate = targetPlanningDate - 1`), while `currentBalanceCartons` reflects live mid-day Physical FG On-Hand and `dispatchedOnTargetDayCartons` surfaces the dispatched volume so unshipped remaining commitments do not double-count already-shipped stock.
  - **Future-Day Cumulative Forward Simulation (`targetPlanningDate > todayStr`)**: Simulates intermediate calendar days (`< targetPlanningDate`) from Live Physical FG On-Hand by subtracting unshipped open demand (`not_yet`, `prepare`, `shipped`) and adding remaining un-received active `work_orders` plus scheduled sales returns (`return_deduct` / `return_no_deduct`), producing an Estimated Opening Balance for `targetPlanningDate`.
  - **Planned Inflows & Trip Extras Hook**: Counts active non-cancelled, non-completed `work_orders` on `planDate` net of already-accepted FG pallets (`max(0, plannedCartons - acceptedFgPalletsCartons)`), scheduled commercial returns, and a reserved `plannedTripExtrasCartons` hook for future Trip Dispatch Extras Slips (avoiding speculation on unsettled retail truck inventory).
  - **Live Staged Edits & View Modes**: Recomputes immediately against unsaved `stagedAssignments` (`loadingDate` / `fulfillmentStatus`) in `SalesLoadingPlanMaster.jsx`; offers a 1-click **By SKU / By Packing** toggle (with `hasOptionDeficit` alert indicators when `'ANY'` or option pools create a sub-option shortfall), subtle monospace SKU/option IDs, product thumbnails (`imageFile`), click-to-expand equation details with **Client Name chips** for `prepare` and `ordered` commitments, and fixed 3-tier priority sorting (**Deficits** -> **Active Unfulfilled Orders** -> **Remaining Catalog**). Plus collapsible push-layout (`paddingInlineEnd`) and floating pulsing deficit icons on the edge handle.

### 32.4 Per-Order & Row-Level Trip Priority Stock Availability (`buildOrderTripAvailabilityMap` & `OrderCartonsAvailabilityChip`)
- **Sequential Priority Allocation (`buildOrderTripAvailabilityMap` in `src/utils/fgStockEngine.js`)**:
  - Ranks all open outbound physical orders (`prepare`, `not_yet`) by **Effective Loading Date (asc) → `prepare` before `not_yet` → Trip # (`loadingOrderNumber`, asc; unassigned last) → Order Serial # (asc)** tie-breaker.
  - Feeds Today/Past dates strictly from **Live Physical FG On-Hand** (`buildFgStockMatrix`), while progressively unlocking active remaining `work_orders` and scheduled sales returns for future loading dates (`> todayStr`).
  - Matches explicit packing options (`A`/`B`) strictly against their respective option balances, while `'ANY'` draws flexibly from the largest available active option balance of that SKU.
- **UI Surfacing (`SalesLoadingPlanMaster.jsx`)**:
  - Enlarged 2-line clickable **`OrderCartonsAvailabilityChip`** on every order card displaying Cartons + Availability tier (**Green**: `ALL Available` at `100%`, **Amber**: `50%–99%`, **Red**: `0%–49%`, counting `qty + bonus` cartons; neutral badges for `Dispatched` and `Incoming Return`).
  - Clicking opens **`OrderProductsDetailsModal`**, displaying an order priority banner and a per-line **Availability (`التوفر`)** chip on every SKU row matching the allocated carton count and packing option.

### 32.5 FG Warehouse Truck Dispatch & Return Receiving (`truck_dispatch` & `truck_dispatches`)
- **Navigation Surface**: Registered directly after `loading_plan` inside **Sales & Distribution (`sales.tabs.truck_dispatch`)** across `appArchitecture.js`, `tabAppearanceConfig.js`, `App.jsx`, `LandingPage.jsx`, `TopNavbar.jsx`, `notificationEngine.js`, and `commentEngine.js`.
- **View Component & Helpers**: `src/components/TruckDispatchMaster.jsx` + pure utility module `src/utils/truckDispatchUtils.js`.
  - **Chronological Trip Grouping & Gate**: Groups physical `sales_orders` by `${loadingDate}_LO-${loadingOrderNumber}`, defaulting focus to **Today** (`loadingDate === todayStr`) sorted most recent first. Trips containing `not_yet` (Pending) orders remain disabled until transitioned to `prepare`.
  - **Dual Pre-Requisite Gate**: Confirming the Dispatch Modal writes `truck_dispatches/{tripId}` (`dispatchStatus: 'loaded'`) and stamps `fgWarehouseDispatched: true` on included `sales_orders` (establishing the FG Warehouse pre-requisite gate ahead of `shipped`, paired alongside the upcoming Accounting Financial Documents gate).
  - **Dispatch Matrix, Precautionary Extras & Dual Labour Effort**: Features a read-only **Client (Rows) × Product/Packing-Option (Columns)** matrix with locked totals, an editable **`+ Trip Extras`** row (plus optional extra-only SKU columns), **`Total Dispatched` (`Locked + Extras`)**, and dual **Warehouse Loading Crew** + **Offloading/Accompanying Crew** selectors with auto-equalizing `100%` effort split inputs.
  - **SSOT FG Inventory & Sidebar Sync (`fgStockEngine.js`)**: Dispatched Extras deduct from Physical FG On-Hand (`TRIP_EXTRAS_OUT`), unreturned Extras populate `plannedTripExtrasCartons` (`+ExtRet`) inside `LoadingPlanFgSidebar`, and reconciled Good Returned Extras re-credit Physical FG On-Hand (`TRIP_EXTRAS_RETURN`).
  - **Return / Receiving Matrix & Two-Way Task Handshake**: Both Accountant and FG Warehouse Custodian share `TruckReturnReceivingModal` (Extras row + Client Returns per order type + Variance Footer + unified `stockReturnDate`). Return inspection strictly unlocks only once the trip reaches `shipped`/`delivered`.
  - **Retail Settlement ↔ Warehouse Hold & EOD `جرد` Deferral (`stockReturnDate`)**: `RetailSettlementModal` syncs unsold returns into `truck_dispatches` (`pending_wh_confirm`) and assigns `truck_return_wh_confirm` to FG custodians. Dispatched loaded quantities stay deducted (`SALES_DISPATCH`) until both sides reconcile (`reconciled`) AND `stockReturnDate` arrives (`TRIP_CLIENT_RETURN`), while EOD `جرد`-deferred returns (`stockReturnDate > todayStr`) remain excluded from Today's live shelf balance and feed `LoadingPlanFgSidebar` forward simulation for `stockReturnDate`.
  - **Discrepancy Escalation**: WH exact match marks `reconciled`, while any variance enters `discrepancy_pending_accounting` and assigns `truck_return_accountant_review` via `user_actions_queue`.
  - **Immutable Dispatch Documents Registry (`dispatch_documents` & `system_config/dispatch_doc_counter`)**: Assigns monotonic sequential numbers (`DD-00001`, `DD-00002`, ...) persisted with frozen `modelSnapshot` payloads and live `Valid` vs. `Legacy` evaluation (trips that moved into `shipped` keep their Dispatch Document `Valid` and route undelivered orders into `undeliveredOrders[]` → Expected Returns, while pre-shipment reversals/cancellations/edits flip the doc to `Legacy`). Surfaceable via the date-filterable `DispatchDocumentsHistoryModal` even when trips are unlinked or cancelled.
  - **Concise Generated Documents Standard**: Enforces crisp 1-word Arabic labels, 1-word QR captions (`للنظام`, `المسار`, `الموقع`, `الأحدث`), smart conditional pruning of empty sections/fields, 1-line Legacy/status strips, generous breathing room, light-fill/dark-ink print palette (no dark-filled printable cells/rows/pills), and a `0.78` auto-fit readability floor with clean multi-page flow (`src/utils/dispatchDocumentBuilder.js`).






---

## 25. Unified HR-Ready Personnel Directory, Multi-Department Architecture & 3-Layer Permissions

### 25.1 Canonical Master Data Collections
- **`departments` (`DepartmentsMaster.jsx`)**: First-class organizational departments (`id`, `code`, `nameAr`, `nameEn`, `description`, `headEmployeeId`, `color`, `isActive`). Replaces legacy free-text department strings across the ERP.
- **`employees` (`EmployeesDirectoryMaster.jsx`)**: Unified HR-ready staff, workers, and system users directory (`id`, `employeeCode`, `nameAr`, `nameEn`, `phone`, `email`, `departmentIds[]`, `departmentId` primary, `departmentNameAr`, `jobTitle`, `operationalTags[]`, `isSystemUser`, `linkedUserId`, `role`, `status`, `hrProfile { nationalId, hireDate, contractType, shiftType, notes }`).
  - Supports **multi-department membership** (`departmentIds: string[]`).
  - Automatically syncs active/revoked system login accounts to `users/{linkedUserId}` when `isSystemUser` is toggled.
  - All operational modules (`TruckDispatchMaster`, `SalesLoadingPlanMaster`, `VehiclesMaster`, `WorkOrdersMaster`, `ProductionProcessesMaster`, `CashSafesMaster`, `ChartOfAccountsMaster`, `cashLedgerEngine`) consume `employees` as the single source of truth via `buildUnifiedPersonnelPool` (`src/utils/personnelDirectory.js`).

### 25.2 Navigation Consolidation (Sidebar, Landing Page & Top Navbar)
- Master Data exposes a clean 2-tab personnel & access structure across all 3 navigation surfaces (`App.jsx`, `LandingPage.jsx`, `TopNavbar.jsx`) and `tabAppearanceConfig.js`:
  1. `#departments` — **الأقسام وصلاحياتها / Departments & Permissions**
  2. `#employees` — **الموظفون والعمالة والمستخدمون / Staff, Workers & Users**
- Legacy `#users` and `#production_workers` URLs cleanly redirect into `EmployeesDirectoryMaster` pre-filtered to `system` or `worker`.

### 25.3 3-Layer Permission Resolution (`src/config/appArchitecture.js`)
- `resolveEffectivePermissions` & `getPermissionCellMeta` evaluate permissions in strict precedence:
  1. **General Admin Bypass**: `isGeneralAdmin || role === 'general_admin'` → full access.
  2. **Layer 1 — Role Defaults**: `DEFAULT_ROLE_PERMISSIONS.standard`.
  3. **Layer 2 — Multi-Department Union**: evaluates each assigned department's `departmentOverrides[deptId]` (with per-department tab cascade) and takes the union across all of the user's departments.
  4. **Layer 3 — Individual User Override**: `userOverrides[user.id]` wins over the department union (supports both granting extra access and explicitly revoking a department permission).
  5. **Tab Cascade Deselection**: if `effectiveModules[tabId] === false`, all `actions[tabId.*]` and `fields[tabId.*]` evaluate to `false`.
- Persisted in `system_config/permissions` via `setDoc(..., { mergeFields: ['departmentOverrides', 'userOverrides', 'updatedAt', 'updatedBy'] })` in `ScopedPermissionMatrixModal.jsx` (2-mode Departments / User Overrides grid with `Inherited` vs `Custom` badges and 1-click `Reset to Dept`).

---

## 26. Hybrid Automated System Restore (Time Machine)

- **Access & Placement (`SystemRestoreHub.jsx` inside `AdminControlPanel.jsx`)**: Exclusively accessible to General Admin via `#admin_panel?subTab=system_restore` (`الاستعادة الزمنية / System Restore`), with zero buttons exposed on individual operational tab banners.
- **Hybrid Capture Engine (`src/utils/systemRestoreEngine.js` & `functions/index.js`)**:
  - **Spark-Compatible In-App Scheduler (`startAutoRestoreScheduler`)**: Mounted in `App.jsx` for active user sessions using an atomic Firestore transaction lease (`system_restore_config/scheduler`), idle-skip optimization (60m heartbeat), and a configurable daily Firestore read quota guard.
  - **Optional 24/7 Cloud Function (`scheduledSystemRestoreSnapshot` in `functions/index.js`)**: Ready for Blaze plan deployment (`firebase deploy --only functions`) in `me-central2` (`Africa/Cairo` timezone, every 15 minutes).
- **Content-Addressed Compression & Retention (`src/utils/systemRestoreScopeCatalog.js`)**:
  - Canonicalizes documents cleanly (`Timestamp` / `Date` preservation + sorted keys), computes SHA-256 hashes, compresses changed collections with `gzip+base64`, and chunks blobs (`<650 KB` per doc via `__p{i}`) inside `system_restore_blobs`. Unchanged collections reuse existing blob hashes across snapshots.
  - Retention defaults: **15m interval**, **12h intra-day**, **14d daily anchors**, **8 safety (`pre_restore`/`pre_purge`) points**, and permanent retention for `manual` / `pinned` checkpoints, with reference-counted orphan blob GC.
- **3-Level Rollback with Always-Full-Relational-Cascade (`resolveRestoreScopePlan` & `computeRestoreDiffPlan`)**:
  - Supports **System-Wide**, **Module**, and **Tab** rollback with Date/Time jump matching (`findNearestRestorePointForDateTime`), live per-collection Diff Preview (`+Recreate`, `~Revert`, `-Remove`, `Unchanged`, `Untouched`), automatic `pre_restore` safety checkpoint + `RESTORE` typed confirmation, post-restore recalculation of `items.stock` & `cash_safes`/`corporate_banks`, and 1-click Undo via `system_restore_logs`.

