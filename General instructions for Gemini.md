# General Instructions for Gemini — Al-Tawoos ERP

## 1. Communication & Handover
- **Language**: Always communicate in English.
- **Delivery Summary**: Always provide a clear summary of what was built/updated, files touched, and explicit step-by-step testing instructions (including test data and expected outcomes).
- **Proactive Clarification**: When receiving complex, ambiguous, or multi-step requirements, use `/grill-me` to align on edge cases, permissions, and database schemas before writing code.

---

## 2. Global Architectural Alignment
Every new module, tab, or feature must align with the global system architecture:
- **Master Lists Allocation & Dynamic MDM Registration**: 
  - Consistently reference master data (`items`, `warehouses`, `suppliers`, `clients`, `safes`, `bank_accounts`, `vehicles`, `cost_centers`, `chart_of_accounts`).
  - **Dynamic Master Collections & Purge Immunity**:
    - Any new tab added to the Master Database module (`master_data`) must be registered in `src/config/appArchitecture.js` under `modules.master_data.tabs` with its target Firestore `collection`.
    - Master collections are auto-derived dynamically via `getMasterCollectionsRegistry(APP_ARCHITECTURE)`. Never hardcode static counts or static lists of master collections.
    - The Database Purge engine ("Wipe Operational Data Only") must **strictly and dynamically exclude** all collections registered under `master_data.tabs` (as well as core masters: `users`, `system_config`, and `chart_of_accounts`), ensuring newly added master tabs are automatically and permanently immune from operational data resets.
    - Master Data telemetry (MDM in System Configuration) and Backup/Restore must dynamically reflect the auto-updated registry without requiring manual UI text or counter modifications.
- **Financial & Dual-Ledger Integrity**: 
  - All movements affecting valuation or cash must sync with the General Ledger (`journal_entries`) and Cash Ledger (`cash_transactions`).
  - Strict validation: No transaction posted without valid GL account codes and sub-ledgers.
  - Tax logic: Non-taxable purchase orders must enforce 0% VAT and 0% WHT.
  - **Dues & Installments Tracking (`dues_tracking`)**:
    - Every approved `GRN` (+) and `RTN` (-) inherits and snapshots the supplier's `paymentTerms` (`delivery_date`, `end_of_month`, or `advance_payment`) and allocates its `netPayable` independently into scheduled tranches.
    - **Strict Overpayment Prevention & Chronological Batch Settlement**: Overpayment is strictly forbidden ($0 < \text{Released} \le \text{Remaining}$). Multi-record batch payments sort selected records chronologically by due date ascending and allow partial release on any row (`partially_closed`).
    - **PO Advance Anti-Repayment**: Advance payments recorded against a `PO` (`PO-YYYYMMDDXX-ADV`) automatically deduct from incoming `GRN` tranches linked via `poId` (`prePaidViaPoAdvanceAmount`) and absorb unpaid PO advances upon delivery so the same amount is never paid twice.
    - **A4 Dual-Half 1% WHT Certificate (`WhtNotePrintSlip.jsx`)**: Taxable documents subject to 1% WHT generate a sequential `WHT-YYYY-XXXX` certificate printed on a single A4 page split into **2 identical horizontal halves** separated by a dashed cut line (`✂`) — Top Half handed to the supplier (stamped original) and Bottom Half signed/stamped by the supplier to confirm receipt and archived.
  - **100% Setup-Driven Financial Statements & Multi-Level COA Hierarchy (`financial_statements` & `accounts`)**:
    - **Zero Hardcoded Routing**: Financial Statements (`FinancialStatementsMaster.jsx` & `FinancialStatementPrintSlip.jsx`) must route accounts **exclusively** by their configured `statement`, `reportCategory`, `statementEffect`, `nature`, `cashFlowCategory`, `parentCode`, `level`, and `displayOrder`. Never use hardcoded account code prefix checks (`code.startsWith(...)`), hardcoded safe/bank overrides, or `Math.max(0, bal)` clamping.
    - **16-Column COA CSV/Excel Standard**: Maintain the 16-column COA schema (`code, nameAr, nameEn, level, type, parentCode, statement, reportCategory, statementEffect, nature, cashFlowCategory, subType, requiresCostCenter, displayOrder, descriptionAr, descriptionEn`).
    - **Contra-Accounts (`statementEffect: 'deduct'`)**: Contra-accounts (such as Accumulated Depreciation `10102`/`1010202`–`1010211` or Sales Returns/Discounts) deduct from their section total and render in accounting parentheses `(amount)`.
    - **Vertical Balance Sheet & Display Level Roll-Up**: The Balance Sheet must always use the **Vertical Structure** (Assets stacked above Liabilities & Shareholders' Equity, cumulative up to `endDate`, with Prior Retained Net Income + Current Period Net Income rolled into Equity). Both Income Statement and Balance Sheet must support the `displayLevel` roll-up selector (`summary`, `2`, `3`, `4`, `all`) and `showZeroBalances` toggle.
- **Maker-Checker & Approvals**: Inter-safe transfers and sensitive fund reallocations require initiator creation and recipient confirmation.
- **RBAC, Scoped Permissions & Cascade Deselection**:
  - Guard new buttons, actions, and tabs using defined role permissions (`effectivePermissions`).
  - **Hierarchical Cascade Rule**: In both the Admin Control Panel (`AdminControlPanel.jsx`) and the Scoped Permission Matrix Modal (`ScopedPermissionMatrixModal.jsx`) as well as runtime `effectivePermissions` (`App.jsx`), if a user has **"Show Tab in Navigation"** (`modules[tabId]`) deselected (`false`), all subordinate selections below it (**Operational Actions** `actions[tabId.*]` and **Sensitive Field Masking** `fields[tabId.*]`) must be **automatically deselected (`false`)**, visually dimmed, and disabled (`cursor-not-allowed`).
- **Notifications & Actions Required**: Generate actionable alerts via `createActionRequired` / `createNotification` for pending workflows.
- **Cross-App Collaborative Comments & Task Assignment (Reusable Row-Level Architecture v3)**:
  - **Reusable Component Integration**: Any new or existing module/tab must integrate commenting exclusively via the reusable `<RecordCommentAction>` component and `useRecordComments` hook (`src/components/comments/RecordCommentAction.jsx`), never via manual inline comment buttons.
  - **Row/Record-Level Scope**: Comments operate strictly at the record/row level (`fieldKey: null`, `targetType: 'row'`). Modals are strictly excluded from the comment system.
  - **Conditional 3-Dots Grouping & Unread-Only Counter**:
    - If a record/row has **no comments** (`totalCount === 0`), the comment action must be grouped inside the 3-vertical-dots (`⋮`) overflow menu alongside secondary row actions.
    - Once a record has comments (`totalCount > 0`), the comment button renders inline on the row. Its counter badge displays **strictly the count of unread messages** (`unreadCount`) for the current user and disappears immediately once all messages are read.
    - The right-click context menu (`CommentContextMenu.jsx`) comment action dynamically inherits the icon and color state of that target record/row.
  - **Read Detection & Smart Auto-Scroll**: Accessing a comment thread accurately detects unread messages, marks them as read (`readBy` per message) for the current user, and automatically scrolls down to the **first unread message** (or to the **last message** if all messages are already read).
  - **Inline `@FullName` Chips & Per-Message Task Resolution (`تم إنجاز المهمة`)**:
    - Assigning a task to a user via the `User+` button or typing `@` inserts a `@FullName` chip (full user name, not just first name) directly into the message text so multiple tasks within one thread clearly show which message each user is assigned to.
    - Tasks are resolved at the **individual message level** (not whole-thread level) via the **"تم إنجاز المهمة"** button on the specific message card, bidirectionally synced with `user_actions_queue` in the Header Alert Center.
  - **Strict Target Audience & Sidebar Privacy Isolation**:
    - Default target audience on thread open includes all users who have access to the target record/tab (`isUserAuthorizedForTab`).
    - Users who do not have access to the target tab or who are unselected from `targetAudienceIds` must **never** receive alerts/notifications and must **not** see those comments in the **"مركز المحادثات والمهام"** (`GlobalCommentsDrawer`) sidebar.
  - **Audit Immutability**: Individual comments are strictly immutable once posted (no edit/delete of individual messages). Entire thread deletion is restricted to the thread author or General Admin only.
  - **Bilingual Interface**: Full Arabic and English localization with automatic text direction (`dir="auto"`).

---

## 3. UI/UX Global Standards
- **Dropdowns**: Any selector for GL accounts, cost centers, or partners must use `SearchableSelect`.
- **Text Accommodation**: Description and notes fields must allow long text without clipping or truncation.
- **Native Routing & Refresh Standard**: The browser URL hash must always dynamically reflect the active tab, module, and sub-tab (`#tab?subTab=...&module=...`). On tab changes, previous parameters must be cleanly discarded. Native browser reload (F5 / Cmd+R) and mobile pull-to-refresh reliably restore the exact active screen and sub-route. Redundant in-app refresh buttons in the navbar or page header banners are deprecated to keep the UI clean.
- **Print Optimization**: All modal/tab print actions must use dedicated print slips optimized for A4 (or thermal label specifications), completely isolating print content from navigation sidebars and page backgrounds.

---

## 4. Code Quality, Verification & Deployment
- **Static Diagnostic Scan**: Audit imports and identifiers across modified files to guarantee zero `ReferenceError` or missing icon/function imports.
- **Build Verification**: Run `npm run build` to verify clean bundling.
- **Live Deployment**: Deploy validated builds to Firebase Hosting (`firebase deploy --only hosting`) and report the live URL.

---

## 5. Blueprint & Architecture Maintenance
- Whenever new modules, tabs, permissions, or ledger mechanics are added:
  1. Register them in `src/config/appArchitecture.js`.
  2. Document the logic and data flows in `docs/ProjectBlueprint.md`.