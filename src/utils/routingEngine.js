/**
 * Unified Smart Audience & Workflow Event Routing Engine (Phase 2A)
 *
 * Bridges:
 *  - `departments` + `employees` (isSystemUser, departmentIds[], operationalTags[])
 *  - 3-Layer Permissions (`resolveEffectivePermissions`, `canAccessAction`, `canAccessField`)
 *  - Admin Routing Overrides (`system_config/notifications_config.eventRoutingOverrides`)
 *
 * Consumed by Notifications, Action Required Tasks, Notification Control Center, and Comments (@Department).
 */

import {
  DEFAULT_ROLE_PERMISSIONS,
  resolveEffectivePermissions,
  canAccessAction,
  getPermissionCellMeta,
} from '../config/appArchitecture.js';
import { getRecordDepartmentIds } from './personnelDirectory.js';

export const WORKFLOW_MODULE_GROUPS = [
  { id: 'sales', labelAr: 'المبيعات وأوامر البيع', labelEn: 'Sales & Orders' },
  { id: 'dispatch', labelAr: 'خطة التحميل وصرف الشاحنات', labelEn: 'Loading Plan & Truck Dispatch' },
  { id: 'production', labelAr: 'الإنتاج والمنتج التام', labelEn: 'Production & FG' },
  { id: 'purchases', labelAr: 'المشتريات والمخازن', labelEn: 'Purchases & Inventory' },
  { id: 'finance', labelAr: 'المالية والخزائن', labelEn: 'Finance & Safes' },
];

export const WORKFLOW_EVENT_CATALOG = [
  // 1. Sales & Orders
  {
    key: 'sales_order_pending_approval',
    module: 'sales',
    kind: 'action_required',
    labelAr: 'أمر بيع بانتظار الاعتماد',
    labelEn: 'Sales Order Pending Approval',
    requiredPermission: { tabId: 'sales_orders', actionKey: 'canApprove' },
    defaultIncludeGeneralAdmins: true,
  },
  {
    key: 'sales_order_approved',
    module: 'sales',
    kind: 'notification',
    labelAr: 'اعتماد أمر بيع وتجهيزه للتحميل',
    labelEn: 'Sales Order Approved',
    requiredPermission: { tabId: 'loading_plan', actionKey: 'canManageLoadingPlan' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'sales_order_partial_rejection',
    module: 'sales',
    kind: 'action_required',
    labelAr: 'رفض جزئي / مرتجع من العميل بعد الصرف',
    labelEn: 'Client Partial Rejection / Post-Dispatch Return',
    requiredPermission: { tabId: 'sales_orders', actionKey: 'canApprove' },
    defaultIncludeGeneralAdmins: true,
  },

  // 2. Loading Plan & Truck Dispatch
  {
    key: 'trip_ready_to_load',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'رحلة جاهزة للتحميل والصرف بالمخزن (Preparing)',
    labelEn: 'Trip Ready for Warehouse Loading',
    requiredPermission: { tabId: 'truck_dispatch', actionKey: 'canDispatchTruck' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'trip_post_dispatch_plan_drift',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'تعديل خطة التحميل بعد اعتماد الصرف (تنبيه عاجل)',
    labelEn: 'Loading Plan Modified After Dispatch (Urgent)',
    requiredPermission: { tabId: 'truck_dispatch', actionKey: 'canEditDispatchedTrip' },
    defaultIncludeGeneralAdmins: true,
  },
  {
    key: 'trip_dispatched_out',
    module: 'dispatch',
    kind: 'notification',
    labelAr: 'خروج الشاحنة للتوصيل واعتماد الصرف',
    labelEn: 'Truck Dispatched Out for Delivery',
    requiredPermission: { tabId: 'loading_plan', actionKey: 'canManageLoadingPlan' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'trip_return_variance_accounting',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'فروقات في مرتجعات الرحلة تتطلب مراجعة الحسابات',
    labelEn: 'Trip Return Variance Requiring Accounting Review',
    requiredPermission: { tabId: 'truck_dispatch', actionKey: 'canRegisterAccountantReturn' },
    defaultIncludeGeneralAdmins: true,
  },
  {
    key: 'trip_return_expected_warehouse',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'تسجيل مرتجع متوقع للرحلة بانتظار استلام المخزن',
    labelEn: 'Expected Trip Return Awaiting Warehouse Receipt',
    requiredPermission: { tabId: 'truck_dispatch', actionKey: 'canReceiveWarehouseReturn' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'trip_return_alignment_accounting',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'استلام مخزني مطابق لمرتجع الرحلة بانتظار تأكيد الحسابات',
    labelEn: 'Matched Warehouse Trip Return Pending Accounting Alignment',
    requiredPermission: { tabId: 'truck_dispatch', actionKey: 'canRegisterAccountantReturn' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'trip_return_order_settlement_task',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'مهمة تعديل أو إضافة أوامر بيع لتسوية مرتجع رحلة',
    labelEn: 'Sales Order Adjustment / Creation Task for Trip Return Settlement',
    requiredPermission: { tabId: 'sales_orders', actionKey: 'canEdit' },
    defaultIncludeGeneralAdmins: true,
  },
  {
    key: 'retail_settlement_pending',
    module: 'dispatch',
    kind: 'action_required',
    labelAr: 'تسوية رحلة تجزئة بانتظار تأكيد الكميات المباعة',
    labelEn: 'Retail Route Pending Sold-Qty Settlement',
    requiredPermission: { tabId: 'loading_plan', actionKey: 'canManageLoadingPlan' },
    defaultIncludeGeneralAdmins: false,
  },

  // 3. Production & FG
  {
    key: 'work_order_created',
    module: 'production',
    kind: 'notification',
    labelAr: 'إصدار أمر تشغيل وإنتاج جديد',
    labelEn: 'New Production Work Order Created',
    requiredPermission: { tabId: 'work_orders', actionKey: 'canCreate' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'fg_inward_pending_receipt',
    module: 'production',
    kind: 'action_required',
    labelAr: 'بالتات منتج تام بانتظار الاستلام بالمخزن',
    labelEn: 'FG Pallets Pending Warehouse Receipt',
    requiredPermission: { tabId: 'fg_inward', actionKey: 'canConfirm' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'faulty_fg_return_logged',
    module: 'production',
    kind: 'action_required',
    labelAr: 'تسجيل مرتجع / معيب منتج تام للفحص',
    labelEn: 'Faulty FG Return Logged for Inspection',
    requiredPermission: { tabId: 'faulty_fg', actionKey: 'canResolve' },
    defaultIncludeGeneralAdmins: true,
  },

  // 4. Purchases & Inventory
  {
    key: 'po_pending_approval',
    module: 'purchases',
    kind: 'action_required',
    labelAr: 'أمر شراء (PO) بانتظار الاعتماد',
    labelEn: 'Purchase Order Pending Approval',
    requiredPermission: { tabId: 'purchase_orders', actionKey: 'canApprove' },
    defaultIncludeGeneralAdmins: true,
  },
  {
    key: 'grn_pending_receipt',
    module: 'purchases',
    kind: 'action_required',
    labelAr: 'خامات معتمدة بانتظار الاستلام المخزني (GRN)',
    labelEn: 'Approved PO Pending Goods Receipt',
    requiredPermission: { tabId: 'goods_receipts', actionKey: 'canCreate' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'stock_transfer_pending_receive',
    module: 'purchases',
    kind: 'action_required',
    labelAr: 'تحويل مخزني بانتظار تأكيد الاستلام',
    labelEn: 'Stock Transfer Pending Confirmation',
    requiredPermission: { tabId: 'transfers', actionKey: 'canConfirm' },
    defaultIncludeGeneralAdmins: false,
  },
  {
    key: 'stock_count_variance',
    module: 'purchases',
    kind: 'action_required',
    labelAr: 'فروقات جرد مخزني بانتظار المراجعة والاعتماد',
    labelEn: 'Physical Stock Count Variance Review',
    requiredPermission: { tabId: 'stock_count', actionKey: 'canApprove' },
    defaultIncludeGeneralAdmins: true,
  },

  // 5. Finance & Safes
  {
    key: 'cash_voucher_pending_approval',
    module: 'finance',
    kind: 'action_required',
    labelAr: 'إذن صرف / قبض نقدي بانتظار الاعتماد',
    labelEn: 'Cash Voucher Pending Approval',
    requiredPermission: { tabId: 'cash_safes', actionKey: 'canApprove' },
    defaultIncludeGeneralAdmins: true,
  },
  {
    key: 'custody_settlement_review',
    module: 'finance',
    kind: 'action_required',
    labelAr: 'تسوية عهدة بانتظار المراجعة المالية',
    labelEn: 'Custody Settlement Pending Financial Review',
    requiredPermission: { tabId: 'cash_safes', actionKey: 'canApprove' },
    defaultIncludeGeneralAdmins: true,
  },
];

export const WORKFLOW_EVENTS_BY_KEY = Object.fromEntries(
  WORKFLOW_EVENT_CATALOG.map((ev) => [ev.key, ev])
);

/**
 * Normalizes active system user accounts by merging `users` with linked `employees`
 * so `departmentIds`, `operationalTags`, and `isSystemUser` are always accurate.
 * Non-system workers (`isSystemUser === false`) are strictly excluded.
 */
export function buildActiveSystemUsers({ users = [], employees = [], departments = [] } = {}) {
  const empByLinkedUser = {};
  (employees || []).forEach((emp) => {
    if (emp?.linkedUserId) empByLinkedUser[emp.linkedUserId] = emp;
  });

  const activeList = [];
  const seenIds = new Set();

  (users || []).forEach((u) => {
    if (!u?.id || seenIds.has(u.id)) return;
    const linkedEmp = empByLinkedUser[u.id] || null;

    // Exclude inactive accounts or employees explicitly marked as non-system workers
    if (u.status === 'inactive' || u.isActive === false) return;
    if (linkedEmp && (linkedEmp.status === 'inactive' || linkedEmp.isActive === false || linkedEmp.isSystemUser === false)) {
      return;
    }

    seenIds.add(u.id);
    const mergedDeptIds = getRecordDepartmentIds(linkedEmp || u, departments);
    const mergedTags = Array.isArray(linkedEmp?.operationalTags)
      ? linkedEmp.operationalTags
      : Array.isArray(u.operationalTags)
      ? u.operationalTags
      : [];

    activeList.push({
      ...u,
      id: u.id,
      nameAr: linkedEmp?.nameAr || u.nameAr || u.name || u.id,
      name: linkedEmp?.nameEn || u.name || u.nameAr || u.id,
      departmentId: mergedDeptIds[0] || u.departmentId || '',
      departmentIds: mergedDeptIds,
      operationalTags: mergedTags,
      isGeneralAdmin: Boolean(u.isGeneralAdmin || u.role === 'general_admin' || linkedEmp?.isGeneralAdmin),
      isSystemUser: true,
    });
  });

  return activeList;
}

/**
 * Unified Smart Audience Resolver used by Notifications, Action Required Tasks & Routing Matrix Preview.
 */
export function resolveTargetUsers({
  eventKey = null,
  requiredPermission = null, // { tabId, actionKey }
  departmentIds = [],
  operationalTags = [],
  explicitUserIds = [],
  onlyExplicitUsers = false,
  includeGeneralAdmins = undefined,
  excludeActorId = null,
  users = [],
  employees = [],
  departments = [],
  departmentOverrides = {},
  userOverrides = {},
  eventRoutingOverrides = {},
  defaultRolePermissions = DEFAULT_ROLE_PERMISSIONS,
} = {}) {
  const catalogEv = eventKey ? WORKFLOW_EVENTS_BY_KEY[eventKey] : null;
  const adminRule = eventKey && eventRoutingOverrides ? eventRoutingOverrides[eventKey] : null;

  // If admin explicitly disabled this workflow event in Notification Control Center
  if (adminRule && adminRule.enabled === false) {
    return {
      enabled: false,
      targetUserIds: [],
      targetDepartmentIds: [],
      resolvedUsers: [],
      includeGeneralAdmins: false,
      mode: adminRule.mode || 'auto_permission',
    };
  }

  const effectiveIncludeGM =
    adminRule && adminRule.includeGeneralAdmins !== undefined
      ? Boolean(adminRule.includeGeneralAdmins)
      : includeGeneralAdmins !== undefined
      ? Boolean(includeGeneralAdmins)
      : catalogEv
      ? Boolean(catalogEv.defaultIncludeGeneralAdmins)
      : true;

  const mode = adminRule?.mode || 'auto_permission'; // 'auto_permission' | 'custom'
  const effPermission = requiredPermission || catalogEv?.requiredPermission || null;
  const ruleDeptIds = Array.isArray(adminRule?.departmentIds) ? adminRule.departmentIds.filter(Boolean) : [];
  const ruleCcUserIds = Array.isArray(adminRule?.ccUserIds) ? adminRule.ccUserIds.filter(Boolean) : [];

  const targetDeptIds = Array.from(
    new Set([
      ...(Array.isArray(departmentIds) ? departmentIds.filter(Boolean) : []),
      ...ruleDeptIds,
    ])
  );
  const explicitSet = new Set([
    ...(Array.isArray(explicitUserIds) ? explicitUserIds.filter(Boolean) : []),
    ...ruleCcUserIds,
  ]);
  const tagFilterSet = new Set(Array.isArray(operationalTags) ? operationalTags.filter(Boolean) : []);

  const activeUsers = buildActiveSystemUsers({ users, employees, departments });
  const matchedUsers = [];
  const matchedIds = new Set();

  activeUsers.forEach((u) => {
    if (excludeActorId && u.id === excludeActorId) return;

    // 1. Explicit user target / CC always matches
    if (explicitSet.has(u.id)) {
      matchedIds.add(u.id);
      matchedUsers.push(u);
      return;
    }

    // Strict explicit-assignee mode (e.g. "Pick Specific Users" on Settlement Task Delegation)
    if (onlyExplicitUsers && explicitSet.size > 0) {
      return;
    }

    // 2. General Admin inclusion rule
    if (u.isGeneralAdmin) {
      if (effectiveIncludeGM) {
        matchedIds.add(u.id);
        matchedUsers.push(u);
      }
      return;
    }

    // 3. Mode-based matching for standard active system users
    if (mode === 'custom') {
      // Custom admin override: match if user belongs to any selected target department
      if (targetDeptIds.length > 0 && u.departmentIds.some((dId) => targetDeptIds.includes(dId))) {
        matchedIds.add(u.id);
        matchedUsers.push(u);
      }
      return;
    }

    // Auto-by-Permission mode
    const effPerms = resolveEffectivePermissions({
      user: u,
      departmentIds: u.departmentIds,
      departmentOverrides,
      userOverrides,
      defaultRolePermissions,
    });

    let permOk = true;
    if (effPermission?.tabId) {
      if (effPermission.actionKey) {
        permOk = canAccessAction(effPerms, effPermission.tabId, effPermission.actionKey, u);

        // Department fallback for return receiving events when standard defaults are false
        // and no explicit override denies access for DEPT-WH / DEPT-FIN members
        if (
          !permOk &&
          effPermission.tabId === 'truck_dispatch' &&
          effPerms.modules?.truck_dispatch !== false
        ) {
          const dottedMeta = getPermissionCellMeta({
            user: u,
            departmentIds: u.departmentIds,
            departmentOverrides,
            userOverrides,
            kind: 'actions',
            key: `truck_dispatch.${effPermission.actionKey}`,
            defaultRolePermissions,
          });
          const shortMeta = getPermissionCellMeta({
            user: u,
            departmentIds: u.departmentIds,
            departmentOverrides,
            userOverrides,
            kind: 'actions',
            key: effPermission.actionKey,
            defaultRolePermissions,
          });
          const activeMeta =
            dottedMeta.source === 'user_override' || dottedMeta.source === 'department'
              ? dottedMeta
              : shortMeta;
          const explicitDeny =
            (activeMeta.source === 'user_override' || activeMeta.source === 'department') &&
            activeMeta.effectiveValue === false;

          if (!explicitDeny) {
            const matchesWh =
              effPermission.actionKey === 'canReceiveWarehouseReturn' &&
              (u.departmentIds.includes('DEPT-WH') ||
                u.departmentIds.some(
                  (id) => String(departments.find((d) => d.id === id)?.code || '').toUpperCase() === 'WH'
                ));
            const matchesFin =
              effPermission.actionKey === 'canRegisterAccountantReturn' &&
              (u.departmentIds.includes('DEPT-FIN') ||
                u.departmentIds.some(
                  (id) => String(departments.find((d) => d.id === id)?.code || '').toUpperCase() === 'FIN'
                ));
            if (matchesWh || matchesFin) {
              permOk = true;
            }
          }
        }
      } else {
        permOk = effPerms.modules?.[effPermission.tabId] !== false;
      }
    }

    const deptOk =
      targetDeptIds.length === 0 ||
      u.departmentIds.some((dId) => targetDeptIds.includes(dId));

    const tagOk =
      tagFilterSet.size === 0 ||
      u.operationalTags.some((t) => tagFilterSet.has(t));

    if (permOk && deptOk && tagOk) {
      matchedIds.add(u.id);
      matchedUsers.push(u);
    }
  });

  return {
    enabled: true,
    targetUserIds: Array.from(matchedIds),
    targetDepartmentIds: mode === 'custom' ? targetDeptIds : [],
    resolvedUsers: matchedUsers,
    includeGeneralAdmins: effectiveIncludeGM,
    mode,
  };
}

/**
 * Expands a `@Department` mention or group comment task into all active system users
 * belonging to that department who have 3-layer RBAC access to the target tab.
 */
export function expandDepartmentToAuthorizedUsers({
  deptId,
  targetTab,
  isSensitive = false,
  users = [],
  employees = [],
  departments = [],
  departmentOverrides = {},
  userOverrides = {},
  excludeUserId = null,
  defaultRolePermissions = DEFAULT_ROLE_PERMISSIONS,
} = {}) {
  if (!deptId) return [];
  const activeUsers = buildActiveSystemUsers({ users, employees, departments });

  return activeUsers.filter((u) => {
    if (excludeUserId && u.id === excludeUserId) return false;
    if (!u.departmentIds.includes(deptId)) return false;

    if (u.isGeneralAdmin) return true;
    const effPerms = resolveEffectivePermissions({
      user: u,
      departmentIds: u.departmentIds,
      departmentOverrides,
      userOverrides,
      defaultRolePermissions,
    });

    if (targetTab && effPerms.modules?.[targetTab] === false) return false;
    if (isSensitive && effPerms.sensitive?.canViewPrices === false && effPerms.sensitive?.canViewTotals === false) {
      return false;
    }
    return true;
  });
}
