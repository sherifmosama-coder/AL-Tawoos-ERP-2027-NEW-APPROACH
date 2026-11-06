import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import {
  playNotificationSound,
  requestNotificationPermission,
  checkPushNotificationSupport,
  showDesktopNotification,
  registerServiceWorker,
  registerFcmPushToken,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  completeActionRequired
} from '../utils/notificationEngine';
import { syncOneSignalUser, sendTestMobilePush, optInOneSignalPush } from '../utils/oneSignalEngine';

export function useHeaderAlerts(currentUser) {
  const [actionsQueue, setActionsQueue] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeToasts, setActiveToasts] = useState([]);
  const [permissionStatus, setPermissionStatus] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // Tracking sets to differentiate initial boot records from newly arrived live events
  const seenActionIdsRef = useRef(null);
  const seenNotifIdsRef = useRef(null);

  // Initialize Service Worker once on mount
  useEffect(() => {
    registerServiceWorker();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  // Filter helper: matches current user permissions & excludes self-initiator
  const isActionForUser = useCallback(
    (item) => {
      if (!currentUser || !currentUser.id) return false;

      // 1. Strict Initiator Exclusion: Never assign action to the user who triggered/created it
      if (
        item.createdBy === currentUser.id ||
        item.createdBy === currentUser.name ||
        item.createdBy === currentUser.nameAr
      ) {
        return false;
      }

      // 2. Direct user targeting (single user or array of authorized custodians)
      const isTargetedDirectly =
        (item.targetUserId && item.targetUserId === currentUser.id) ||
        (Array.isArray(item.targetUserIds) && item.targetUserIds.includes(currentUser.id));

      if (isTargetedDirectly) {
        return true;
      }

      // CRITICAL: Comment tasks are strictly and exclusively isolated to the targeted assigned user(s)
      if (item.actionType === 'comment_task') {
        return false;
      }

      // 3. General Admin sees general business workflow approvals (unless self-initiated)
      const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';
      if (isGeneralAdmin) {
        return true;
      }

      // If action is targeted specifically to dedicated custodian(s), exclude other non-admin users
      const hasSpecificUserTarget = !!item.targetUserId || (Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0);
      if (hasSpecificUserTarget) {
        return false;
      }

      // 4. Role targeting (only applies if no specific custodian was targeted)
      if (Array.isArray(item.targetRoles) && item.targetRoles.length > 0) {
        if (item.targetRoles.includes(currentUser.role)) return true;
        if (currentUser.isPurchasingAdmin && item.targetRoles.includes('purchasing_manager')) return true;
      }

      // 5. Open targeting
      if (!hasSpecificUserTarget && (!item.targetRoles || item.targetRoles.length === 0)) {
        return true;
      }

      return false;
    },
    [currentUser]
  );

  // Filter helper: matches notifications for current user
  const isNotificationForUser = useCallback(
    (item) => {
      if (!currentUser || !currentUser.id) return false;

      // 1. Author suppression: never alert the author for their own actions/comments
      if (
        item.createdBy === currentUser.id ||
        item.createdBy === currentUser.name ||
        item.createdBy === currentUser.nameAr
      ) {
        return false;
      }

      // 2. Direct user targeting (single user or array of authorized users)
      const hasSpecificUserTarget = !!item.targetUserId || (Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0);
      if (hasSpecificUserTarget) {
        if (item.targetUserId === currentUser.id) return true;
        if (Array.isArray(item.targetUserIds) && item.targetUserIds.includes(currentUser.id)) return true;
        return false;
      }

      // 3. General Admin sees non-targeted system announcements
      const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';
      if (isGeneralAdmin) return true;

      // 4. Role targeting (for non-user-specific alerts)
      if (Array.isArray(item.targetRoles) && item.targetRoles.length > 0) {
        return item.targetRoles.includes(currentUser.role) || item.targetRoles.includes('all');
      }

      return true;
    },
    [currentUser]
  );

  // Trigger arrival alerts (sound + vibration + mobile notification + in-app toast)
  const triggerArrivalAlert = useCallback((item, kind = 'notification') => {
    // 1. Play sound chime
    playNotificationSound();

    // 2. Mobile Physical Vibration (Haptic feedback for phones)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (e) {}
    }

    const isAction = kind === 'action_required';
    const title = item.title || (isAction ? 'إجراء مطلوب' : 'إشعار جديد');
    const body = item.message || '';

    // Detect mobile device
    const isMobileDevice = typeof window !== 'undefined' && (
      window.innerWidth < 768 ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator?.userAgent || '')
    );

    // 3. OS-level notification on mobile devices OR when desktop window is hidden/minimized
    if ((typeof document !== 'undefined' && document.hidden) || isMobileDevice) {
      showDesktopNotification({
        title,
        body,
        tag: item.id,
        targetTab: item.targetTab,
        highlightId: item.highlightId,
        targetModule: item.targetModule,
        onClick: () => {
          if (item.targetTab) {
            window.location.hash = `#tab=${item.targetTab}${item.highlightId ? `&highlight=${item.highlightId}` : ''}`;
          }
        }
      });
    }

    // Always push to in-app toast queue (which auto-dismisses after 15s)
    setActiveToasts((prev) => {
      const exists = prev.some((t) => t.id === item.id);
      if (exists) return prev;
      return [
        {
          ...item,
          kind,
          arrivedAt: Date.now()
        },
        ...prev.slice(0, 4) // Keep at most 5 concurrent toasts
      ];
    });
  }, []);

  // 1. Live Firestore Listener: user_actions_queue (pending actions)
  useEffect(() => {
    if (!currentUser?.id) {
      setActionsQueue([]);
      return;
    }

    const q = query(
      collection(db, 'user_actions_queue'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const matchingActions = [];
        const currentSeen = seenActionIdsRef.current;
        const isFirstLoad = currentSeen === null;
        const newSeen = new Set(currentSeen || []);

        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() };
          if (isActionForUser(data)) {
            matchingActions.push(data);

            // If not initial load and this is a newly arrived action
            if (!isFirstLoad && !currentSeen.has(data.id)) {
              triggerArrivalAlert(data, 'action_required');
            }
          }
          newSeen.add(data.id);
        });

        // Sort: newest first
        matchingActions.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });

        seenActionIdsRef.current = newSeen;
        setActionsQueue(matchingActions);
      },
      (error) => {
        console.error('Error listening to user_actions_queue:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.role, isActionForUser, triggerArrivalAlert]);

  // 2. Live Firestore Listener: system_notifications
  useEffect(() => {
    if (!currentUser?.id) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'system_notifications'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const matchingNotifs = [];
        const currentSeen = seenNotifIdsRef.current;
        const isFirstLoad = currentSeen === null;
        const newSeen = new Set(currentSeen || []);

        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() };
          if (isNotificationForUser(data)) {
            matchingNotifs.push(data);

            // If not initial load and this is a newly arrived notification
            if (!isFirstLoad && !currentSeen.has(data.id)) {
              // Only alert if unread by this user
              const isUnread = !data.readBy || !data.readBy.includes(currentUser.id);
              if (isUnread) {
                triggerArrivalAlert(data, 'notification');
              }
            }
          }
          newSeen.add(data.id);
        });

        // Sort: newest first
        matchingNotifs.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });

        seenNotifIdsRef.current = newSeen;
        setNotifications(matchingNotifs);
      },
      (error) => {
        console.error('Error listening to system_notifications:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.role, isNotificationForUser, triggerArrivalAlert]);

  // Derived unread lists and badge counts
  const unreadNotifications = notifications.filter(
    (n) => !n.readBy || !n.readBy.includes(currentUser?.id)
  );

  const actionsBadgeCount = actionsQueue.length;
  const notificationsBadgeCount = unreadNotifications.length;

  // Actions handlers
  const handleMarkAsRead = useCallback(
    async (notificationId) => {
      if (!currentUser?.id) return;
      await markNotificationAsRead(notificationId, currentUser.id);
    },
    [currentUser?.id]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!currentUser?.id || unreadNotifications.length === 0) return;
    const ids = unreadNotifications.map((n) => n.id);
    await markAllNotificationsAsRead(ids, currentUser.id);
  }, [currentUser?.id, unreadNotifications]);

  const handleCompleteAction = useCallback(
    async (actionType, docId, resolutionNote) => {
      await completeActionRequired({
        actionType,
        docId,
        completedBy: currentUser?.id,
        completedByName: currentUser?.nameAr || currentUser?.name || 'User',
        resolutionNote
      });
    },
    [currentUser]
  );

  const handleDismissToast = useCallback((toastId) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  // Automatically register / sync FCM push token if permission was already granted
  useEffect(() => {
    if (
      currentUser?.id &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      registerFcmPushToken(currentUser.id).catch(() => {});
    }
  }, [currentUser?.id]);

  const handleRequestPermission = useCallback(async () => {
    const result = await requestNotificationPermission(currentUser?.id);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
    if (result?.success && currentUser) {
      syncOneSignalUser(currentUser);
      await optInOneSignalPush(currentUser).catch(() => {});
    }
    return result;
  }, [currentUser]);

  const handleSendTestPush = useCallback(async () => {
    return sendTestMobilePush(currentUser);
  }, [currentUser]);

  return {
    actionsQueue,
    notifications,
    unreadNotifications,
    actionsBadgeCount,
    notificationsBadgeCount,
    activeToasts,
    permissionStatus,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    completeAction: handleCompleteAction,
    dismissToast: handleDismissToast,
    requestPermission: handleRequestPermission,
    checkSupport: checkPushNotificationSupport,
    sendTestPush: handleSendTestPush
  };
}
