import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { APP_ARCHITECTURE, DEFAULT_ROLE_PERMISSIONS, resolveEffectivePermissions } from '../config/appArchitecture';
import { getRecordDepartmentIds } from './personnelDirectory';
import { createActionRequired, completeActionRequired, cancelActionRequired, createNotification } from './notificationEngine';

// =========================================================================
// 1. ACCESS & PERMISSION RESOLVER
// =========================================================================

// Mapping of tab IDs to permissions module keys
const TAB_TO_PERMISSION_KEY_MAP = {
  orders: 'purchase_orders',
  receipts: 'goods_receipts',
  transfers: 'transfers',
  stock: 'stock',
  stock_count: 'stock_count',
  spare_parts: 'spare_parts_issue',
  cash_safes_hub: 'cash_safes',
  custodies_advances: 'cash_safes',
  sales_orders: 'sales_orders',
  loading_plan: 'loading_plan',
  truck_dispatch: 'truck_dispatch',
  sales_invoicing: 'sales_invoicing',
  fg_inward: 'fg_inward',
  fg_balances: 'fg_balances',
  departments: 'departments',
  employees: 'employees'
};

/**
 * Checks whether a user is authorized to access a given tab/module.
 * Evaluates full 3-layer permissions (Role Defaults -> Multi-Department Union -> User Override).
 */
export function isUserAuthorizedForTab({
  user,
  targetModule,
  targetTab,
  cloudPermissions = {},
  departmentOverrides = {},
  departments = [],
}) {
  if (!user || !user.id) return false;
  if (user.status === 'inactive' || user.isActive === false) return false;

  // 1. General Admins always have access to all tabs
  if (user.isGeneralAdmin || user.role === 'general_admin') {
    return true;
  }

  const permKey = TAB_TO_PERMISSION_KEY_MAP[targetTab] || targetTab;
  const userDeptIds = getRecordDepartmentIds(user, departments);
  const effectiveUserOverrides =
    cloudPermissions && Object.keys(cloudPermissions).length > 0
      ? cloudPermissions
      : user.permissions
      ? { [user.id]: user.permissions }
      : {};

  const eff = resolveEffectivePermissions({
    user,
    departmentIds: userDeptIds,
    departmentOverrides,
    userOverrides: effectiveUserOverrides,
    defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
  });

  if (eff.modules?.[permKey] === false || eff.modules?.[targetTab] === false) {
    return false;
  }
  if (targetModule && eff.modules?.[targetModule] === false) {
    return false;
  }
  return true;
}

/**
 * Resolves all user IDs who are authorized to access a given tab/field.
 * Used for targeted notification dispatch and mention list filtering.
 */
export function resolveAuthorizedUserIdsForComment({
  targetModule,
  targetTab,
  targetFieldKey = null,
  isSensitive = false,
  allUsers = [],
  cloudPermissions = {},
  departmentOverrides = {},
  departments = [],
  excludeUserId = null
}) {
  if (!Array.isArray(allUsers) || allUsers.length === 0) return [];

  const authorizedIds = new Set();

  allUsers.forEach((user) => {
    if (!user || !user.id) return;
    if (excludeUserId && user.id === excludeUserId) return; // Author suppression

    // 1. Tab & Module 3-Layer RBAC check
    if (!isUserAuthorizedForTab({ user, targetModule, targetTab, cloudPermissions, departmentOverrides, departments })) {
      return;
    }

    // 2. Sensitive field check: if field is sensitive, user must have sensitive view permission
    if (isSensitive) {
      const userDeptIds = getRecordDepartmentIds(user, departments);
      const eff = resolveEffectivePermissions({
        user,
        departmentIds: userDeptIds,
        departmentOverrides,
        userOverrides: cloudPermissions || {},
        defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
      });
      const fieldPermKey = targetFieldKey ? `${TAB_TO_PERMISSION_KEY_MAP[targetTab] || targetTab}.${targetFieldKey}` : '';
      const hasSensitiveAccess =
        user.isGeneralAdmin ||
        user.role === 'general_admin' ||
        user.canViewSensitiveCosts ||
        eff.sensitive?.canViewPrices === true ||
        eff.sensitive?.canViewTotals === true ||
        (fieldPermKey && eff.fields?.[fieldPermKey] === true) ||
        cloudPermissions[user.id]?.sensitive?.[targetFieldKey] === true ||
        cloudPermissions[user.id]?.sensitive?.all === true;

      if (!hasSensitiveAccess) {
        return; // Denied access to sensitive field comments
      }
    }

    authorizedIds.add(user.id);
  });

  return Array.from(authorizedIds);
}

// =========================================================================
// 2. THREAD CRUD OPERATIONS (IMMUTABLE AUDIT LOG)
// =========================================================================

/**
 * Creates a new comment thread on a row, cell, or card field.
 */
export async function createCommentThread({
  targetModule,
  targetTab,
  targetDocId,
  targetDocNumber = '',
  targetFieldKey = null,
  targetFieldLabel = null,
  targetContextType = 'table_row',
  isSensitive = false,
  text,
  mentions = [],
  isActionRequired = false,
  assignedUsers = [],
  attachments = [],
  customAudience = null,
  currentUser,
  allUsers = [],
  cloudPermissions = {}
}) {
  if (!targetDocId || !text?.trim() || !currentUser?.id) {
    throw new Error('Missing required comment parameters');
  }

  const cleanDocId = String(targetDocId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fieldPart = targetFieldKey ? String(targetFieldKey).replace(/[^a-zA-Z0-9_-]/g, '_') : 'row';
  const threadId = `th_${targetTab || 'tab'}_${cleanDocId}_${fieldPart}_${Date.now()}`;
  const nowIso = new Date().toISOString();

  // Determine assigned users: customAudience takes priority if provided
  let assignedUserIds = [];
  let assignedUserNames = [];

  if (customAudience && Array.isArray(customAudience.actionUserIds)) {
    assignedUserIds = customAudience.actionUserIds.filter((uid) => {
      if (!uid || uid === currentUser.id) return false;
      const userObj = allUsers.find((usr) => usr.id === uid);
      return userObj ? isUserAuthorizedForTab({ user: userObj, targetModule, targetTab, cloudPermissions }) : false;
    });
    assignedUserNames = assignedUserIds.map((uid) => {
      const u = allUsers.find((usr) => usr.id === uid);
      return u ? (u.name || u.nameAr || u.id) : uid;
    });
  } else {
    // Default: Filter assigned users strictly to permitted users on this tab and exclude the author
    const permittedAssignedUsers = (Array.isArray(assignedUsers) ? assignedUsers : []).filter((u) => {
      if (!u || !u.id || u.id === currentUser.id) return false;
      const userObj = allUsers.find((usr) => usr.id === u.id) || u;
      return isUserAuthorizedForTab({ user: userObj, targetModule, targetTab, cloudPermissions });
    });
    assignedUserIds = permittedAssignedUsers.map((u) => u.id);
    assignedUserNames = permittedAssignedUsers.map((u) => u.name || u.nameAr || u.id);
  }

  const assignedUsersObjects = assignedUserIds.map((uid) => {
    const u = allUsers.find((usr) => usr.id === uid);
    return {
      id: uid,
      name: u?.name || uid,
      nameAr: u?.nameAr || null,
      role: u?.role || null
    };
  });

  const initialMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const initialMessage = {
    id: initialMessageId,
    text: text.trim(),
    mentions: Array.isArray(mentions) ? mentions : [],
    attachments: Array.isArray(attachments) ? attachments : [],
    authorId: currentUser.id,
    authorName: currentUser.name || currentUser.displayName || 'User',
    authorNameAr: currentUser.nameAr || null,
    authorRole: currentUser.role || 'user',
    readBy: [currentUser.id],
    createdAt: nowIso,
    isActionRequired: assignedUserIds.length > 0,
    assignedUserIds,
    assignedUsers: assignedUsersObjects,
    isResolved: false,
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedByNameAr: null
  };

  const threadDocRef = doc(db, 'record_comments', threadId);

  const payload = {
    id: threadId,
    targetModule: targetModule || 'purchases',
    targetTab: targetTab || '',
    targetDocId: String(targetDocId),
    targetDocNumber: targetDocNumber || String(targetDocId),
    targetFieldKey: targetFieldKey || null,
    targetFieldLabel: targetFieldLabel || null,
    targetContextType: targetContextType || 'table_cell',
    isSensitive: Boolean(isSensitive),
    status: 'open',

    // Task & Action Required
    isActionRequired: Boolean((isActionRequired || customAudience) && assignedUserIds.length > 0),
    assignedUserIds,
    assignedUserNames,
    actionQueueIds: [],

    // Moderation & Lifecycle
    createdBy: currentUser.id,
    createdByName: currentUser.name || currentUser.displayName || 'User',
    createdByRole: currentUser.role || 'user',
    createdAt: nowIso,
    updatedAt: nowIso,
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNote: null,

    // Chronological Message Stream
    messages: [initialMessage]
  };

  // 1. Task Mentions / Custom Action Takers: Trigger ONLY 'required_action' in user_actions_queue
  if (payload.isActionRequired && assignedUserIds.length > 0) {
    const queueActionId = `comment_task_${threadId}`;
    payload.actionQueueIds = [queueActionId];

    await createActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      docNumber: targetDocNumber || targetDocId,
      title: `مهمة مطلوبة: تعليق على ${targetFieldLabel || targetDocNumber || targetDocId}`,
      titleEn: `Action Required: Comment on ${targetFieldLabel || targetDocNumber || targetDocId}`,
      message: `${currentUser.name || 'User'}: ${text.trim().slice(0, 150)}`,
      messageEn: `${currentUser.name || 'User'}: ${text.trim().slice(0, 150)}`,
      targetTab: targetTab || '',
      targetModule: targetModule || '',
      highlightId: targetDocId,
      createdBy: currentUser.id,
      createdByName: currentUser.name || 'User',
      targetUserIds: assignedUserIds,
      metadata: {
        threadId,
        targetFieldKey,
        targetFieldLabel,
        targetDocId,
        isSensitive
      }
    });
  }

  // Save thread to Firestore
  await setDoc(threadDocRef, payload);

  // 2. Regular Notifications: Sent ONLY to non-assigned permitted users (Excluding author and task assignees)
  try {
    let targetNotificationUserIds = [];

    if (customAudience && Array.isArray(customAudience.notifyUserIds)) {
      targetNotificationUserIds = customAudience.notifyUserIds.filter((uid) => {
        if (!uid || uid === currentUser.id || assignedUserIds.includes(uid)) return false;
        const userObj = allUsers.find((usr) => usr.id === uid);
        if (!userObj || !isUserAuthorizedForTab({ user: userObj, targetModule, targetTab, cloudPermissions })) return false;
        if (isSensitive) {
          const hasSensitiveAccess =
            userObj.isGeneralAdmin ||
            userObj.role === 'general_admin' ||
            userObj.canViewSensitiveCosts ||
            cloudPermissions[userObj.id]?.sensitive?.[targetFieldKey] === true ||
            cloudPermissions[userObj.id]?.sensitive?.all === true ||
            userObj.permissions?.sensitive?.[targetFieldKey] === true ||
            userObj.permissions?.sensitive?.all === true;
          if (!hasSensitiveAccess) return false;
        }
        return true;
      });
    } else {
      targetNotificationUserIds = resolveAuthorizedUserIdsForComment({
        targetModule,
        targetTab,
        targetFieldKey,
        isSensitive,
        allUsers,
        cloudPermissions,
        excludeUserId: currentUser.id
      }).filter((uid) => !assignedUserIds.includes(uid));
    }

    if (targetNotificationUserIds.length > 0) {
      await createNotification({
        notificationType: 'comment_added',
        docId: threadId,
        docNumber: targetDocNumber || targetDocId,
        title: `تعليق جديد: ${targetDocNumber || targetDocId}`,
        titleEn: `New Comment: ${targetDocNumber || targetDocId}`,
        message: `${currentUser.name || 'User'}: ${text.trim().slice(0, 120)}`,
        messageEn: `${currentUser.name || 'User'}: ${text.trim().slice(0, 120)}`,
        targetTab: targetTab || '',
        targetModule: targetModule || '',
        highlightId: targetDocId,
        createdBy: currentUser.id,
        createdByName: currentUser.name || 'User',
        targetUserIds: targetNotificationUserIds,
        metadata: {
          threadId,
          targetFieldKey,
          targetFieldLabel
        }
      });
    }
  } catch (notifErr) {
    console.debug('[CommentEngine] Failed to dispatch notifications:', notifErr);
  }

  return threadId;
}

/**
 * Appends a reply to an existing comment thread.
 * Comments are immutable — no edit or delete of messages.
 */
export async function addThreadReply({
  threadId,
  text,
  mentions = [],
  attachments = [],
  isActionRequired = false,
  assignedUsers = [],
  customAudience = null,
  currentUser,
  allUsers = [],
  cloudPermissions = {}
}) {
  if (!threadId || !text?.trim() || !currentUser?.id) {
    throw new Error('Missing reply parameters');
  }

  const threadDocRef = doc(db, 'record_comments', threadId);
  const snap = await getDoc(threadDocRef);
  if (!snap.exists()) {
    throw new Error('Comment thread not found');
  }

  const threadData = snap.data();
  const nowIso = new Date().toISOString();

  // Resolve newly assigned permitted users: customAudience takes priority
  let newlyAssignedIds = [];

  if (customAudience && Array.isArray(customAudience.actionUserIds)) {
    newlyAssignedIds = customAudience.actionUserIds.filter((uid) => {
      if (!uid || uid === currentUser.id) return false;
      const userObj = allUsers.find((usr) => usr.id === uid);
      return userObj
        ? isUserAuthorizedForTab({
            user: userObj,
            targetModule: threadData.targetModule,
            targetTab: threadData.targetTab,
            cloudPermissions
          })
        : false;
    });
  } else {
    const newlyAssigned = (Array.isArray(assignedUsers) ? assignedUsers : []).filter((u) => {
      if (!u || !u.id || u.id === currentUser.id) return false;
      const userObj = allUsers.find((usr) => usr.id === u.id) || u;
      return isUserAuthorizedForTab({
        user: userObj,
        targetModule: threadData.targetModule,
        targetTab: threadData.targetTab,
        cloudPermissions
      });
    });
    newlyAssignedIds = newlyAssigned.map((u) => u.id);
  }

  const assignedUsersObjects = newlyAssignedIds.map((uid) => {
    const u = allUsers.find((usr) => usr.id === uid);
    return {
      id: uid,
      name: u?.name || uid,
      nameAr: u?.nameAr || null,
      role: u?.role || null
    };
  });

  const newReply = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    text: text.trim(),
    mentions: Array.isArray(mentions) ? mentions : [],
    attachments: Array.isArray(attachments) ? attachments : [],
    authorId: currentUser.id,
    authorName: currentUser.name || currentUser.displayName || 'User',
    authorNameAr: currentUser.nameAr || null,
    authorRole: currentUser.role || 'user',
    readBy: [currentUser.id],
    createdAt: nowIso,
    isActionRequired: newlyAssignedIds.length > 0,
    assignedUserIds: newlyAssignedIds,
    assignedUsers: assignedUsersObjects,
    isResolved: false,
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedByNameAr: null
  };

  const updatedMessages = [...(threadData.messages || []), newReply];

  const mergedAssignedUserIds = Array.from(new Set([...(threadData.assignedUserIds || []), ...newlyAssignedIds]));

  const updatePayload = {
    messages: updatedMessages,
    updatedAt: nowIso,
    status: 'open' // Any reply re-activates thread conversation
  };

  // If new task assigned in reply, trigger action required
  if ((isActionRequired || (customAudience && newlyAssignedIds.length > 0)) && newlyAssignedIds.length > 0) {
    updatePayload.isActionRequired = true;
    updatePayload.assignedUserIds = mergedAssignedUserIds;

    const queueActionId = `comment_task_${threadId}`;
    if (!threadData.actionQueueIds?.includes(queueActionId)) {
      updatePayload.actionQueueIds = [...(threadData.actionQueueIds || []), queueActionId];
    }

    await createActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      docNumber: threadData.targetDocNumber || threadData.targetDocId,
      title: `مهمة مطلوبة: تعليق على ${threadData.targetFieldLabel || threadData.targetDocNumber || threadData.targetDocId}`,
      titleEn: `Action Required: Comment on ${threadData.targetFieldLabel || threadData.targetDocNumber || threadData.targetDocId}`,
      message: `${currentUser.name || 'User'}: ${text.trim().slice(0, 150)}`,
      messageEn: `${currentUser.name || 'User'}: ${text.trim().slice(0, 150)}`,
      targetTab: threadData.targetTab || '',
      targetModule: threadData.targetModule || '',
      highlightId: threadData.targetDocId,
      createdBy: currentUser.id,
      createdByName: currentUser.name || 'User',
      targetUserIds: newlyAssignedIds,
      metadata: {
        threadId,
        targetFieldKey: threadData.targetFieldKey,
        targetFieldLabel: threadData.targetFieldLabel,
        targetDocId: threadData.targetDocId
      }
    });
  }

  await updateDoc(threadDocRef, updatePayload);

  // Notify permitted participants (Excluding author and task assignees)
  try {
    let targetNotificationUserIds = [];

    if (customAudience && Array.isArray(customAudience.notifyUserIds)) {
      targetNotificationUserIds = customAudience.notifyUserIds.filter((uid) => {
        if (!uid || uid === currentUser.id || mergedAssignedUserIds.includes(uid)) return false;
        const userObj = allUsers.find((usr) => usr.id === uid);
        if (!userObj || !isUserAuthorizedForTab({ user: userObj, targetModule: threadData.targetModule, targetTab: threadData.targetTab, cloudPermissions })) return false;
        if (threadData.isSensitive) {
          const hasSensitiveAccess =
            userObj.isGeneralAdmin ||
            userObj.role === 'general_admin' ||
            userObj.canViewSensitiveCosts ||
            cloudPermissions[userObj.id]?.sensitive?.[threadData.targetFieldKey] === true ||
            cloudPermissions[userObj.id]?.sensitive?.all === true ||
            userObj.permissions?.sensitive?.[threadData.targetFieldKey] === true ||
            userObj.permissions?.sensitive?.all === true;
          if (!hasSensitiveAccess) return false;
        }
        return true;
      });
    } else {
      const participantIds = new Set();
      if (threadData.createdBy && threadData.createdBy !== currentUser.id) {
        participantIds.add(threadData.createdBy);
      }
      (mentions || []).forEach((m) => {
        if (m.id && m.id !== currentUser.id) participantIds.add(m.id);
      });

      // Exclude all assigned task recipients
      const effectiveAssignees = isActionRequired ? mergedAssignedUserIds : (threadData.assignedUserIds || []);
      effectiveAssignees.forEach((uid) => participantIds.delete(uid));

      // Exclude users without tab permission
      targetNotificationUserIds = Array.from(participantIds).filter((uid) => {
        const userObj = allUsers.find((u) => u.id === uid);
        return userObj
          ? isUserAuthorizedForTab({
              user: userObj,
              targetModule: threadData.targetModule,
              targetTab: threadData.targetTab,
              cloudPermissions
            })
          : false;
      });
    }

    if (targetNotificationUserIds.length > 0) {
      await createNotification({
        notificationType: 'comment_reply',
        docId: threadId,
        docNumber: threadData.targetDocNumber || threadData.targetDocId,
        title: `رد جديد على تعليق: ${threadData.targetDocNumber || threadData.targetDocId}`,
        titleEn: `New Reply: ${threadData.targetDocNumber || threadData.targetDocId}`,
        message: `${currentUser.name || 'User'}: ${text.trim().slice(0, 120)}`,
        messageEn: `${currentUser.name || 'User'}: ${text.trim().slice(0, 120)}`,
        targetTab: threadData.targetTab || '',
        targetModule: threadData.targetModule || '',
        highlightId: threadData.targetDocId,
        createdBy: currentUser.id,
        createdByName: currentUser.name || 'User',
        targetUserIds: targetNotificationUserIds
      });
    }
  } catch (err) {
    console.debug('[CommentEngine] Failed to send reply notification:', err);
  }

  return newReply;
}

/**
 * Marks all messages in a comment thread as read for a specific user.
 */
export async function markThreadAsRead({ threadId, userId }) {
  if (!threadId || !userId) return;
  try {
    const threadRef = doc(db, 'record_comments', threadId);
    const snap = await getDoc(threadRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const messages = data.messages || [];
    let hasChanges = false;

    const updatedMessages = messages.map((m) => {
      const readList = Array.isArray(m.readBy) ? m.readBy : (m.authorId ? [m.authorId] : []);
      if (!readList.includes(userId)) {
        hasChanges = true;
        return { ...m, readBy: [...readList, userId] };
      }
      return m;
    });

    if (hasChanges) {
      await updateDoc(threadRef, { messages: updatedMessages });
    }
  } catch (err) {
    console.debug('[CommentEngine] markThreadAsRead note:', err.message);
  }
}

/**
 * Resolves an individual message task within a comment thread.
 * Enables granular message-level task completion without closing the entire conversation thread.
 */
export async function resolveMessageTask({
  threadId,
  messageId,
  currentUser,
  resolutionNote = ''
}) {
  if (!threadId || !messageId || !currentUser?.id) return;

  const threadDocRef = doc(db, 'record_comments', threadId);
  const snap = await getDoc(threadDocRef);
  if (!snap.exists()) return;

  const thread = snap.data();
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const targetMsgIndex = messages.findIndex((m) => m && m.id === messageId);

  if (targetMsgIndex === -1) {
    throw new Error('Message not found');
  }

  const targetMsg = messages[targetMsgIndex];

  // Authorization: task assignee, message author, thread author, or General Admin
  const isAssignee = Array.isArray(targetMsg.assignedUserIds) && targetMsg.assignedUserIds.includes(currentUser.id);
  const isMsgAuthor = targetMsg.authorId === currentUser.id;
  const isThreadAuthor = thread.createdBy === currentUser.id;
  const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';

  if (!isAssignee && !isMsgAuthor && !isThreadAuthor && !isGeneralAdmin) {
    throw new Error('غير مصرح لك بإنجاز هذه المهمة');
  }

  const nowIso = new Date().toISOString();

  const updatedTargetMsg = {
    ...targetMsg,
    isResolved: true,
    resolvedAt: nowIso,
    resolvedBy: currentUser.id,
    resolvedByName: currentUser.name || currentUser.displayName || 'User',
    resolvedByNameAr: currentUser.nameAr || null,
    resolutionNote: resolutionNote || null
  };

  const updatedMessages = [...messages];
  updatedMessages[targetMsgIndex] = updatedTargetMsg;

  // Check if any action messages remain unresolved across the thread
  const remainingActionMessages = updatedMessages.filter(
    (m) => m.isActionRequired && !m.isResolved && Array.isArray(m.assignedUserIds) && m.assignedUserIds.length > 0
  );

  const isThreadStillActionRequired = remainingActionMessages.length > 0;

  // Re-calculate remaining assignedUserIds across all unresolved action messages
  const remainingAssignedUserIds = Array.from(
    new Set(remainingActionMessages.flatMap((m) => m.assignedUserIds || []))
  );

  const updatePayload = {
    messages: updatedMessages,
    updatedAt: nowIso,
    isActionRequired: isThreadStillActionRequired,
    assignedUserIds: remainingAssignedUserIds
  };

  await updateDoc(threadDocRef, updatePayload);

  // If all action messages across the thread are resolved, complete the action item in user_actions_queue
  if (!isThreadStillActionRequired) {
    await completeActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      completedBy: currentUser.id,
      completedByName: currentUser.name || 'User',
      resolutionNote: resolutionNote || 'All message tasks completed'
    });
  }

  return updatedTargetMsg;
}

/**
 * Re-opens a previously resolved message task.
 */
export async function reopenMessageTask({
  threadId,
  messageId,
  currentUser
}) {
  if (!threadId || !messageId || !currentUser?.id) return;

  const threadDocRef = doc(db, 'record_comments', threadId);
  const snap = await getDoc(threadDocRef);
  if (!snap.exists()) return;

  const thread = snap.data();
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const targetMsgIndex = messages.findIndex((m) => m && m.id === messageId);

  if (targetMsgIndex === -1) {
    throw new Error('Message not found');
  }

  const targetMsg = messages[targetMsgIndex];

  // Authorization: assignee, message author, thread author, or General Admin
  const isAssignee = Array.isArray(targetMsg.assignedUserIds) && targetMsg.assignedUserIds.includes(currentUser.id);
  const isMsgAuthor = targetMsg.authorId === currentUser.id;
  const isThreadAuthor = thread.createdBy === currentUser.id;
  const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';

  if (!isAssignee && !isMsgAuthor && !isThreadAuthor && !isGeneralAdmin) {
    throw new Error('غير مصرح لك بإعادة فتح هذه المهمة');
  }

  const nowIso = new Date().toISOString();

  const updatedTargetMsg = {
    ...targetMsg,
    isResolved: false,
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedByNameAr: null,
    resolutionNote: null
  };

  const updatedMessages = [...messages];
  updatedMessages[targetMsgIndex] = updatedTargetMsg;

  const allAssignedIds = Array.from(
    new Set(
      updatedMessages
        .filter((m) => m.isActionRequired && !m.isResolved)
        .flatMap((m) => m.assignedUserIds || [])
    )
  );

  await updateDoc(threadDocRef, {
    messages: updatedMessages,
    updatedAt: nowIso,
    isActionRequired: true,
    assignedUserIds: allAssignedIds,
    status: 'open'
  });

  // Re-create the action item in user_actions_queue
  if (targetMsg.assignedUserIds?.length > 0) {
    await createActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      docNumber: thread.targetDocNumber || thread.targetDocId,
      title: `مهمة معاد فتحها: تعليق على ${thread.targetFieldLabel || thread.targetDocNumber || thread.targetDocId}`,
      titleEn: `Reopened Task: Comment on ${thread.targetFieldLabel || thread.targetDocNumber || thread.targetDocId}`,
      message: `${currentUser.name || 'User'}: تم إعادة فتح المهمة`,
      messageEn: `${currentUser.name || 'User'}: Task reopened`,
      targetTab: thread.targetTab || '',
      targetModule: thread.targetModule || '',
      highlightId: thread.targetDocId,
      createdBy: currentUser.id,
      createdByName: currentUser.name || 'User',
      targetUserIds: targetMsg.assignedUserIds
    });
  }

  return updatedTargetMsg;
}

/**
 * Resolves a comment thread and synchronizes with user_actions_queue (Dual-Sync).
 */
export async function resolveCommentThread({
  threadId,
  currentUser,
  resolutionNote = ''
}) {
  if (!threadId || !currentUser?.id) return;

  const threadDocRef = doc(db, 'record_comments', threadId);
  const snap = await getDoc(threadDocRef);
  if (!snap.exists()) return;

  const thread = snap.data();

  // Moderation check: only author, assignee, or general admin can resolve
  const isAuthor = thread.createdBy === currentUser.id;
  const isAssignee = Array.isArray(thread.assignedUserIds) && thread.assignedUserIds.includes(currentUser.id);
  const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';

  if (!isAuthor && !isAssignee && !isGeneralAdmin) {
    throw new Error('Permission denied: Only the thread author, assignee, or Admin can resolve this thread');
  }

  const nowIso = new Date().toISOString();

  await updateDoc(threadDocRef, {
    status: 'resolved',
    resolvedAt: nowIso,
    resolvedBy: currentUser.id,
    resolvedByName: currentUser.name || currentUser.displayName || 'User',
    resolutionNote: resolutionNote || null
  });

  // Dual-Sync: Complete linked action in user_actions_queue
  if (thread.isActionRequired) {
    await completeActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      completedBy: currentUser.id,
      completedByName: currentUser.name || 'User',
      resolutionNote: resolutionNote || 'Resolved via comment thread'
    });
  }
}

/**
 * Re-opens a previously resolved comment thread.
 */
export async function reopenCommentThread({
  threadId,
  currentUser
}) {
  if (!threadId || !currentUser?.id) return;

  const threadDocRef = doc(db, 'record_comments', threadId);
  const snap = await getDoc(threadDocRef);
  if (!snap.exists()) return;

  const thread = snap.data();

  const isAuthor = thread.createdBy === currentUser.id;
  const isAssignee = Array.isArray(thread.assignedUserIds) && thread.assignedUserIds.includes(currentUser.id);
  const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';

  if (!isAuthor && !isAssignee && !isGeneralAdmin) {
    throw new Error('Permission denied: Only the thread author, assignee, or Admin can re-open this thread');
  }

  const nowIso = new Date().toISOString();

  await updateDoc(threadDocRef, {
    status: 'open',
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolutionNote: null,
    updatedAt: nowIso
  });

  // If this was an Action Required, recreate the action item
  if (thread.isActionRequired && thread.assignedUserIds?.length > 0) {
    await createActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      docNumber: thread.targetDocNumber || thread.targetDocId,
      title: `مهمة معاد فتحها: تعليق على ${thread.targetFieldLabel || thread.targetDocNumber || thread.targetDocId}`,
      titleEn: `Reopened Task: Comment on ${thread.targetFieldLabel || thread.targetDocNumber || thread.targetDocId}`,
      message: `تم إعادة فتح المناقشة بواسطة ${currentUser.name || 'User'}`,
      messageEn: `Thread reopened by ${currentUser.name || 'User'}`,
      targetTab: thread.targetTab || '',
      targetModule: thread.targetModule || '',
      highlightId: thread.targetDocId,
      createdBy: currentUser.id,
      createdByName: currentUser.name || 'User',
      targetUserIds: thread.assignedUserIds
    });
  }
}

/**
 * Deletes an entire comment thread.
 * STRICT SECURITY: Limited strictly to thread author or General Admin.
 */
export async function deleteCommentThread({
  threadId,
  currentUser
}) {
  if (!threadId || !currentUser?.id) return;

  const threadDocRef = doc(db, 'record_comments', threadId);
  const snap = await getDoc(threadDocRef);
  if (!snap.exists()) return;

  const thread = snap.data();

  const isAuthor = thread.createdBy === currentUser.id;
  const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';

  if (!isAuthor && !isGeneralAdmin) {
    throw new Error('حذف المحادثة مقتصر على منشئ التعليق أو المشرف العام فقط');
  }

  // Cancel any associated action in user_actions_queue
  if (thread.isActionRequired) {
    await cancelActionRequired({
      actionType: 'comment_task',
      docId: threadId,
      cancelledBy: currentUser.id,
      note: 'Thread deleted'
    });
  }

  await deleteDoc(threadDocRef);
}
