import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { markThreadAsRead, isUserAuthorizedForTab } from '../utils/commentEngine';

const CommentContext = createContext(null);

export function CommentProvider({
  children,
  currentUser,
  usersList = [],
  cloudPermissions = {},
  cloudDeptPermissions = {},
  departmentsList = [],
  onSelectModule
}) {
  const [threads, setThreads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Floating in-place Popover state
  const [popoverState, setPopoverState] = useState({
    isOpen: false,
    target: null, // { docId, docNumber, fieldKey, fieldLabel, module, tab, contextType, isSensitive, anchorRect }
    activeThreadId: null
  });

  // Right-click custom context menu state
  const [contextMenuState, setContextMenuState] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    target: null
  });

  // Global Slide-Over Comments Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 1. Subscribe to Live Firestore `record_comments` Collection
  useEffect(() => {
    const q = query(collection(db, 'record_comments'), orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded = snapshot.docs.map((docSnap) => ({
          ...docSnap.data(),
          id: docSnap.id
        }));
        setThreads(loaded);
        setIsLoading(false);
      },
      (error) => {
        console.warn('[CommentContext] Snapshot listener failed:', error.message);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Index threads by target document ID (Row/Record Level)
  const threadsByDocId = useMemo(() => {
    const map = new Map();
    threads.forEach((t) => {
      if (!t.targetDocId) return;
      const docKey = String(t.targetDocId);
      if (!map.has(docKey)) {
        map.set(docKey, []);
      }
      map.get(docKey).push(t);
    });
    return map;
  }, [threads]);

  /**
   * Retrieves the primary or open thread for a given record.
   */
  const getThread = useCallback(
    (docId) => {
      if (!docId) return null;
      const list = threadsByDocId.get(String(docId)) || [];
      // Prefer open thread if one exists, otherwise most recent
      const openThread = list.find((t) => t.status === 'open');
      return openThread || list[0] || null;
    },
    [threadsByDocId]
  );

  /**
   * Checks if an element has active/resolved comments.
   */
  const getCommentStatus = useCallback(
    (docId) => {
      if (!docId) return null;
      const thread = getThread(docId);
      if (!thread) return null;

      // Strict RBAC: If user is not authorized for this tab/module, do not expose comment status
      if (!isUserAuthorizedForTab({
        user: currentUser,
        targetModule: thread.targetModule,
        targetTab: thread.targetTab,
        cloudPermissions,
        departmentOverrides: cloudDeptPermissions,
        departments: departmentsList,
      })) {
        return null;
      }

      if (thread.isSensitive) {
        const hasSensitiveAccess =
          currentUser?.isGeneralAdmin ||
          currentUser?.role === 'general_admin' ||
          currentUser?.canViewSensitiveCosts ||
          cloudPermissions[currentUser?.id]?.sensitive?.[thread.targetFieldKey] === true ||
          cloudPermissions[currentUser?.id]?.sensitive?.all === true ||
          currentUser?.permissions?.sensitive?.[thread.targetFieldKey] === true ||
          currentUser?.permissions?.sensitive?.all === true;
        if (!hasSensitiveAccess) return null;
      }

      const messages = Array.isArray(thread.messages) ? thread.messages : [];
      const currentUserId = currentUser?.id;

      // Calculate unread count specifically for currentUser
      const unreadCount = currentUserId
        ? messages.filter(
            (m) => m && m.authorId !== currentUserId && (!Array.isArray(m.readBy) || !m.readBy.includes(currentUserId))
          ).length
        : 0;

      // Calculate active task assignment specifically for currentUser (respects message-level resolution)
      const actionMessagesForMe = messages.filter(
        (m) => m && m.isActionRequired && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(currentUserId)
      );

      const isAssignedToMe = Boolean(
        thread.status === 'open' &&
        currentUserId &&
        (
          actionMessagesForMe.length > 0
            ? actionMessagesForMe.some((m) => !m.isResolved)
            : (thread.isActionRequired && Array.isArray(thread.assignedUserIds) && thread.assignedUserIds.includes(currentUserId))
        )
      );

      return {
        status: thread.status, // 'open' | 'resolved'
        isActionRequired: Boolean(thread.isActionRequired),
        isAssignedToMe,
        unreadCount,
        hasUnread: unreadCount > 0,
        messageCount: messages.length,
        threadId: thread.id,
        thread
      };
    },
    [getThread, currentUser, cloudPermissions]
  );

  // 3. User Filtered Counts (for header badge - strictly filtered by authorized tabs)
  const stats = useMemo(() => {
    let openCount = 0;
    let actionRequiredForMe = 0;

    threads.forEach((t) => {
      // Strict RBAC: Only count threads for tabs/modules the user has access to
      if (!isUserAuthorizedForTab({
        user: currentUser,
        targetModule: t.targetModule,
        targetTab: t.targetTab,
        cloudPermissions
      })) {
        return;
      }

      // Sensitive check
      if (t.isSensitive) {
        const hasSensitiveAccess =
          currentUser?.isGeneralAdmin ||
          currentUser?.role === 'general_admin' ||
          currentUser?.canViewSensitiveCosts ||
          cloudPermissions[currentUser?.id]?.sensitive?.[t.targetFieldKey] === true ||
          cloudPermissions[currentUser?.id]?.sensitive?.all === true ||
          currentUser?.permissions?.sensitive?.[t.targetFieldKey] === true ||
          currentUser?.permissions?.sensitive?.all === true;
        if (!hasSensitiveAccess) return;
      }

      if (t?.status === 'open') {
        openCount += 1;
        const msgs = Array.isArray(t.messages) ? t.messages : [];
        const actionMsgsForMe = msgs.filter(
          (m) => m && m.isActionRequired && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(currentUser?.id)
        );
        const hasTaskForMe = actionMsgsForMe.length > 0
          ? actionMsgsForMe.some((m) => !m.isResolved)
          : (t.isActionRequired && Array.isArray(t.assignedUserIds) && currentUser?.id && t.assignedUserIds.includes(currentUser.id));

        if (hasTaskForMe) {
          actionRequiredForMe += 1;
        }
      }
    });

    return { openCount, actionRequiredForMe, total: threads.length };
  }, [threads, currentUser, cloudPermissions]);

  // 4. Popover & Context Menu Actions
  const openCommentPopover = useCallback((targetInfo, anchorElementOrRect) => {
    setContextMenuState((prev) => ({ ...prev, isOpen: false }));

    let rect = null;
    if (anchorElementOrRect instanceof Element) {
      rect = anchorElementOrRect.getBoundingClientRect();
    } else if (anchorElementOrRect && typeof anchorElementOrRect.getBoundingClientRect === 'function') {
      rect = anchorElementOrRect.getBoundingClientRect();
    } else if (anchorElementOrRect && typeof anchorElementOrRect.top === 'number') {
      rect = anchorElementOrRect;
    }

    setPopoverState({
      isOpen: true,
      target: { ...targetInfo, anchorRect: rect },
      activeThreadId: targetInfo.threadId || null
    });
  }, []);

  const closeCommentPopover = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openContextMenu = useCallback((e, targetInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const clickX = e.clientX;
    const clickY = e.clientY;

    setContextMenuState({
      isOpen: true,
      x: clickX,
      y: clickY,
      target: targetInfo
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // 5. Jump-to-Target Navigation Coordinator
  const jumpToTarget = useCallback(
    ({ module, tab, docId, fieldKey }) => {
      setIsDrawerOpen(false);

      if (module && tab && onSelectModule) {
        onSelectModule(module, tab);
      }

      // Allow DOM to settle before highlighting and scrolling
      setTimeout(() => {
        const docSelector = `[data-comment-doc="${docId}"]`;
        const targetEl = document.querySelector(docSelector);

        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.add('ring-2', 'ring-amber-500', 'ring-offset-2', 'animate-pulse');
          setTimeout(() => {
            targetEl.classList.remove('ring-2', 'ring-amber-500', 'ring-offset-2', 'animate-pulse');
          }, 3500);

          // Automatically open popover for this comment
          const rect = targetEl.getBoundingClientRect();
          openCommentPopover(
            {
              docId,
              fieldKey,
              module,
              tab
            },
            rect
          );
        }
      }, 400);
    },
    [onSelectModule, openCommentPopover]
  );

  // Row Actions Registry (Map: docId -> array of action objects)
  const rowActionsRegistryRef = useRef(new Map());

  const registerRowActions = useCallback((docId, actions) => {
    if (!docId) return;
    if (actions && Array.isArray(actions) && actions.length > 0) {
      rowActionsRegistryRef.current.set(String(docId), actions);
    } else {
      rowActionsRegistryRef.current.delete(String(docId));
    }
  }, []);

  const getRowActions = useCallback((docId) => {
    if (!docId) return [];
    return rowActionsRegistryRef.current.get(String(docId)) || [];
  }, []);

  // 6. Global Right-Click Event Listener (for declarative data-comment-* elements)
  useEffect(() => {
    const handleGlobalContextMenu = (e) => {
      // Modals are explicitly excluded
      if (e.target.closest('[role="dialog"], .modal-overlay, [data-modal]')) {
        return;
      }

      // Check if user right-clicked a record/row
      const rowTargetEl = e.target.closest('[data-comment-doc]');
      if (!rowTargetEl) return;

      const docId = rowTargetEl.getAttribute('data-comment-doc');
      const docNumber = rowTargetEl.getAttribute('data-comment-number') || docId;
      const tab = rowTargetEl.getAttribute('data-comment-tab') || '';
      const module = rowTargetEl.getAttribute('data-comment-module') || '';
      const isSensitive = rowTargetEl.getAttribute('data-comment-sensitive') === 'true';
      const contextType = rowTargetEl.getAttribute('data-comment-type') || 'table_row';

      // For row-level context menu: look up registered row actions
      const rowActions = getRowActions(docId);

      e.preventDefault();
      e.stopPropagation();

      const existingComment = getCommentStatus(docId);

      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        target: {
          docId,
          docNumber,
          fieldKey: null,
          fieldLabel: null,
          tab,
          module,
          isSensitive,
          contextType,
          rowActions,
          anchorRect: rowTargetEl.getBoundingClientRect(),
          threadId: existingComment?.threadId || null
        }
      });
    };

    const handleGlobalClick = (e) => {
      // Close context menu on outside click
      if (!e.target.closest('#comment-context-menu')) {
        closeContextMenu();
      }
    };

    document.addEventListener('contextmenu', handleGlobalContextMenu);
    document.addEventListener('click', handleGlobalClick);

    return () => {
      document.removeEventListener('contextmenu', handleGlobalContextMenu);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [getCommentStatus, closeContextMenu]);

  const value = {
    threads,
    isLoading,
    getThread,
    getCommentStatus,
    stats,
    popoverState,
    openCommentPopover,
    closeCommentPopover,
    contextMenuState,
    openContextMenu,
    closeContextMenu,
    isDrawerOpen,
    setIsDrawerOpen,
    jumpToTarget,
    registerRowActions,
    getRowActions,
    currentUser,
    usersList,
    cloudPermissions,
    cloudDeptPermissions,
    departmentsList,
    markThreadAsRead
  };

  return <CommentContext.Provider value={value}>{children}</CommentContext.Provider>;
}

export function useRecordComments() {
  const ctx = useContext(CommentContext);
  if (!ctx) {
    throw new Error('useRecordComments must be used within a CommentProvider');
  }
  return ctx;
}
