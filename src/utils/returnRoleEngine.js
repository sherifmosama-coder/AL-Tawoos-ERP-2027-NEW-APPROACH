/**
 * Pure Separation-of-Duties, Department Detection & Permission Engine
 * for Truck Return Receiving (`truck_dispatch`) and Sales Order Settlement.
 * --------------------------------------------------------------------------
 * ZERO React or Firebase imports so Node verification suites can test all rules directly.
 */

import {
  DEFAULT_ROLE_PERMISSIONS,
  canAccessAction,
  getPermissionCellMeta,
  resolveEffectivePermissions,
} from '../config/appArchitecture.js';
import {
  DEFAULT_SEED_DEPARTMENTS,
  getRecordDepartmentIds,
} from './personnelDirectory.js';
import { buildActiveSystemUsers } from './routingEngine.js';

function checkExplicitCell({
  user,
  deptIds,
  departmentOverrides,
  userOverrides,
  actionKey,
  permissions,
}) {
  const dottedKey = `truck_dispatch.${actionKey}`;
  const dottedMeta = getPermissionCellMeta({
    user,
    departmentIds: deptIds,
    departmentOverrides,
    userOverrides,
    kind: 'actions',
    key: dottedKey,
    defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
  });
  const shortMeta = getPermissionCellMeta({
    user,
    departmentIds: deptIds,
    departmentOverrides,
    userOverrides,
    kind: 'actions',
    key: actionKey,
    defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
  });

  // Prefer dotted override if present at user or dept tier, otherwise short key override
  const chosenMeta =
    dottedMeta.source === 'user_override' || dottedMeta.source === 'department'
      ? dottedMeta
      : shortMeta;

  // Fallback when caller supplied resolved `permissions` directly without override maps
  const permActionVal =
    permissions?.actions?.[dottedKey] !== undefined
      ? permissions.actions[dottedKey]
      : permissions?.actions?.[actionKey];

  const hasExplicitOverride =
    chosenMeta.source === 'user_override' || chosenMeta.source === 'department';

  const explicitGrant =
    (hasExplicitOverride && chosenMeta.effectiveValue === true) ||
    (!hasExplicitOverride && permActionVal === true);

  const explicitDeny = hasExplicitOverride && chosenMeta.effectiveValue === false;

  return { explicitGrant, explicitDeny, meta: chosenMeta };
}

/**
 * Resolves a user's Return Receiving authority, department identity, Separation-of-Duties
 * capabilities, and Sales Orders settlement permissions.
 */
export function resolveUserReturnAuthority({
  currentUser = {},
  permissions = null,
  departments = [],
  departmentOverrides = {},
  userOverrides = {},
} = {}) {
  const isGeneralAdmin = Boolean(
    currentUser?.isGeneralAdmin ||
      currentUser?.role === 'general_admin' ||
      currentUser?.role === 'admin'
  );

  const deptCatalog =
    Array.isArray(departments) && departments.length > 0
      ? departments
      : DEFAULT_SEED_DEPARTMENTS;

  const deptIds = getRecordDepartmentIds(currentUser, deptCatalog);
  const deptRecords = deptIds
    .map((id) => deptCatalog.find((d) => d.id === id))
    .filter(Boolean);

  const isWhDept =
    deptIds.includes('DEPT-WH') ||
    deptRecords.some((d) => String(d.code || '').toUpperCase() === 'WH');
  const isFinDept =
    deptIds.includes('DEPT-FIN') ||
    deptRecords.some((d) => String(d.code || '').toUpperCase() === 'FIN');

  const effectivePerms =
    permissions ||
    resolveEffectivePermissions({
      user: currentUser,
      departmentIds: deptIds,
      departmentOverrides,
      userOverrides,
      defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
    });

  const hasTruckDispatchTab =
    isGeneralAdmin || effectivePerms?.modules?.truck_dispatch !== false;

  const whCell = checkExplicitCell({
    user: currentUser,
    deptIds,
    departmentOverrides,
    userOverrides,
    actionKey: 'canReceiveWarehouseReturn',
    permissions: effectivePerms,
  });

  const acctCell = checkExplicitCell({
    user: currentUser,
    deptIds,
    departmentOverrides,
    userOverrides,
    actionKey: 'canRegisterAccountantReturn',
    permissions: effectivePerms,
  });

  const canActAsWarehouse =
    isGeneralAdmin ||
    (hasTruckDispatchTab && (whCell.explicitGrant || (isWhDept && !whCell.explicitDeny)));

  const canActAsAccountant =
    isGeneralAdmin ||
    (hasTruckDispatchTab && (acctCell.explicitGrant || (isFinDept && !acctCell.explicitDeny)));

  const canAccessBothModes =
    isGeneralAdmin || (canActAsWarehouse && canActAsAccountant);

  // Strictly General Admin ONLY may settle/close both departments on a trip or force-write-off unresolved variance
  const canSettleBothSides = isGeneralAdmin;
  const canForceWriteOffVariance = isGeneralAdmin;

  // Granular Sales Order permissions (to settle discrepancies directly vs delegate tasks)
  const hasSalesOrdersTab =
    isGeneralAdmin || effectivePerms?.modules?.sales_orders !== false;
  const canCreateSalesOrder =
    isGeneralAdmin ||
    (hasSalesOrdersTab &&
      canAccessAction(effectivePerms, 'sales_orders', 'canCreate', currentUser));
  const canEditSalesOrder =
    isGeneralAdmin ||
    (hasSalesOrdersTab &&
      canAccessAction(effectivePerms, 'sales_orders', 'canEdit', currentUser));
  const canAdjustDispatchedQty =
    isGeneralAdmin ||
    (hasSalesOrdersTab &&
      canAccessAction(
        effectivePerms,
        'sales_orders',
        'canAdjustDispatchedQuantities',
        currentUser
      ));
  const canSettleRetailOrders =
    isGeneralAdmin ||
    (hasSalesOrdersTab &&
      canAccessAction(effectivePerms, 'sales_orders', 'canSettleRetailOrders', currentUser));

  const canAdjustOrCreateSalesOrders =
    isGeneralAdmin || canCreateSalesOrder || canEditSalesOrder || canAdjustDispatchedQty;

  let detectedRole = 'read_only';
  if (isGeneralAdmin) {
    detectedRole = 'general_admin';
  } else if (canActAsWarehouse && canActAsAccountant) {
    detectedRole = 'dual_explicit';
  } else if (canActAsWarehouse) {
    detectedRole = 'warehouse';
  } else if (canActAsAccountant) {
    detectedRole = 'accountant';
  }

  const defaultActorMode = (dispatchDoc = null) => {
    if (canActAsWarehouse && !canActAsAccountant) return 'warehouse';
    if (canActAsAccountant && !canActAsWarehouse) return 'accountant';
    if (canActAsWarehouse && canActAsAccountant) {
      const st = dispatchDoc?.returnHandshakeStatus;
      if (st === 'discrepancy_pending_accounting' || st === 'pending_accounting_confirm') {
        return 'accountant';
      }
      return 'warehouse';
    }
    return 'warehouse';
  };

  return {
    isGeneralAdmin,
    departmentIds: deptIds,
    departmentNamesAr: deptRecords.map((d) => d.nameAr).filter(Boolean),
    departmentNamesEn: deptRecords.map((d) => d.nameEn).filter(Boolean),
    isWhDept,
    isFinDept,
    hasTruckDispatchTab,
    canActAsWarehouse,
    canActAsAccountant,
    canAccessBothModes,
    canSettleBothSides,
    canForceWriteOffVariance,
    hasSalesOrdersTab,
    canCreateSalesOrder,
    canEditSalesOrder,
    canAdjustDispatchedQty,
    canSettleRetailOrders,
    canAdjustOrCreateSalesOrders,
    detectedRole,
    defaultActorMode,
  };
}

/**
 * Evaluates strict field-level edit locks, Maker-Checker self-approval guard,
 * and WH amendment reason requirements inside TruckReturnReceivingModal.
 */
export function evaluateReturnFieldLocks({
  actorMode = 'warehouse',
  authority = {},
  dispatchDoc = null,
  currentUserId = '',
} = {}) {
  const isReconciled = dispatchDoc?.returnHandshakeStatus === 'reconciled';
  const whAlreadyConfirmed = Boolean(dispatchDoc?.whReturnConfirmedAt);
  const acctAlreadyConfirmed = Boolean(dispatchDoc?.accountantReturnSubmittedAt);
  const cleanUserId = String(currentUserId || '').trim();

  // Maker-Checker guard: a non-admin dual holder who signed one department CANNOT sign the second department on the same trip
  const userSignedWh = Boolean(
    cleanUserId &&
      dispatchDoc?.whReturnConfirmedAt &&
      dispatchDoc?.whReturnConfirmedBy === cleanUserId
  );
  const userSignedAcct = Boolean(
    cleanUserId &&
      dispatchDoc?.accountantReturnSubmittedAt &&
      dispatchDoc?.accountantReturnSubmittedBy === cleanUserId
  );

  const blockedBySelfApproval =
    !authority.isGeneralAdmin &&
    ((actorMode === 'accountant' && userSignedWh) ||
      (actorMode === 'warehouse' && userSignedAcct));

  // Warehouse Actuals: NEVER editable in Accountant mode; permanently locked once reconciled (except General Admin)
  const canEditWhFields =
    actorMode === 'warehouse' &&
    Boolean(authority.canActAsWarehouse) &&
    (!isReconciled || Boolean(authority.isGeneralAdmin)) &&
    !blockedBySelfApproval;

  // Amending an already submitted WH count requires a mandatory audit reason
  const requiresWhAmendReason = canEditWhFields && (whAlreadyConfirmed || isReconciled);

  // Accounting Expected Quantities:
  // - Never editable by Warehouse
  // - Once WH has physically received/locked actuals, Accounting cannot manually tweak Expected numbers;
  //   Expected is strictly live-derived from actual Sales Orders!
  const expectedDerivedLiveFromOrders = whAlreadyConfirmed;
  const canEditAcctExpectedFields =
    actorMode === 'accountant' &&
    Boolean(authority.canActAsAccountant) &&
    !whAlreadyConfirmed &&
    !isReconciled &&
    !blockedBySelfApproval;

  const canSubmitWhSide =
    actorMode === 'warehouse' &&
    Boolean(authority.canActAsWarehouse) &&
    (!isReconciled || Boolean(authority.isGeneralAdmin)) &&
    !blockedBySelfApproval;

  const canSubmitAcctSide =
    actorMode === 'accountant' &&
    Boolean(authority.canActAsAccountant) &&
    (!isReconciled || Boolean(authority.isGeneralAdmin)) &&
    !blockedBySelfApproval;

  const canReopenReconciled = Boolean(isReconciled && authority.isGeneralAdmin);

  return {
    isReconciled,
    whAlreadyConfirmed,
    acctAlreadyConfirmed,
    userSignedWh,
    userSignedAcct,
    blockedBySelfApproval,
    canEditWhFields,
    requiresWhAmendReason,
    canEditAcctExpectedFields,
    expectedDerivedLiveFromOrders,
    canSubmitWhSide,
    canSubmitAcctSide,
    canReopenReconciled,
    selfApprovalReasonAr: blockedBySelfApproval
      ? 'ضبط فصل المهام: قمت باعتماد الطرف الآخر لهذه الرحلة مسبقاً، ولا يمكن لغير المدير العام اعتماد الجهتين على نفس الرحلة.'
      : '',
    selfApprovalReasonEn: blockedBySelfApproval
      ? 'Separation of Duties: You already confirmed the opposing department on this trip. Only a General Admin may finalize both sides.'
      : '',
    whLockedForAccountantAr: whAlreadyConfirmed
      ? 'الكميات المستلمة فعلياً مثبتة من أمين المخزن ولا يمكن تعديلها من المحاسبة.'
      : '',
    whLockedForAccountantEn: whAlreadyConfirmed
      ? 'Actual received quantities were locked by Warehouse Custodian and cannot be edited by Accounting.'
      : '',
  };
}

/**
 * Resolves all active System Users who are authorized (via 3-layer RBAC) to edit,
 * adjust, or create Sales Orders so an Accountant can assign settlement tasks to them.
 */
export function resolveEligibleSalesOrderSettlers({
  users = [],
  employees = [],
  departments = [],
  departmentOverrides = {},
  userOverrides = {},
  excludeActorId = null,
} = {}) {
  const deptCatalog =
    Array.isArray(departments) && departments.length > 0
      ? departments
      : DEFAULT_SEED_DEPARTMENTS;

  const activeUsers = buildActiveSystemUsers({
    users,
    employees,
    departments: deptCatalog,
  });

  const eligible = [];

  activeUsers.forEach((u) => {
    if (excludeActorId && u.id === excludeActorId) return;

    const eff = resolveEffectivePermissions({
      user: u,
      departmentIds: u.departmentIds,
      departmentOverrides,
      userOverrides,
      defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
    });

    const hasSalesOrdersTab = u.isGeneralAdmin || eff.modules?.sales_orders !== false;
    if (!hasSalesOrdersTab) return;

    const canCreate =
      u.isGeneralAdmin || canAccessAction(eff, 'sales_orders', 'canCreate', u);
    const canEdit =
      u.isGeneralAdmin || canAccessAction(eff, 'sales_orders', 'canEdit', u);
    const canAdjust =
      u.isGeneralAdmin ||
      canAccessAction(eff, 'sales_orders', 'canAdjustDispatchedQuantities', u);

    if (!canCreate && !canEdit && !canAdjust) return;

    const deptNamesAr = (u.departmentIds || [])
      .map((id) => deptCatalog.find((d) => d.id === id)?.nameAr)
      .filter(Boolean);
    const deptNamesEn = (u.departmentIds || [])
      .map((id) => deptCatalog.find((d) => d.id === id)?.nameEn)
      .filter(Boolean);

    eligible.push({
      id: u.id,
      nameAr: u.nameAr || u.name || u.id,
      name: u.name || u.nameAr || u.id,
      isGeneralAdmin: Boolean(u.isGeneralAdmin),
      departmentIds: u.departmentIds || [],
      departmentNamesAr: deptNamesAr,
      departmentNamesEn: deptNamesEn,
      capabilities: {
        canCreate: Boolean(canCreate),
        canEdit: Boolean(canEdit),
        canAdjust: Boolean(canAdjust),
      },
    });
  });

  // Sort non-admin sales specialists first, General Admins after, alphabetically by Arabic name
  eligible.sort((a, b) => {
    if (a.isGeneralAdmin !== b.isGeneralAdmin) {
      return a.isGeneralAdmin ? 1 : -1;
    }
    return String(a.nameAr || '').localeCompare(String(b.nameAr || ''), 'ar');
  });

  return eligible;
}
