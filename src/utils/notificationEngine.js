import { db, getFirebaseMessaging } from '../firebase';
import { getToken } from 'firebase/messaging';
import { sendOneSignalPush, requestOneSignalPermission } from './oneSignalEngine';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';

// =========================================================================
// 1. SOUND & AUDIO ALERT (Web Audio API Synthesizer)
// =========================================================================

/**
 * Generates an elegant soft marimba chime using the browser's Web Audio API.
 * Requires 0 external audio files and works instantly across desktop and mobile browsers.
 */
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Dual-harmonic bell chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.3); // D6

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.1);
    osc1.stop(now + 0.55);
    osc2.stop(now + 0.65);
  } catch (err) {
    // Graceful fallback if audio is blocked by user interaction policy
    console.debug('Notification audio playback notice:', err);
  }
}

/**
 * Universal Row Highlight Helper
 * Dispatches an event and locates the DOM element by ID or data-row-id,
 * smoothly scrolls it into view, and pulses an amber highlight ring.
 */
export function highlightTargetRow(highlightId) {
  if (!highlightId || typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('app_highlight_row', { detail: { highlightId } }));

  // Run DOM check with slight delays to accommodate React tab render cycles
  const attemptHighlight = (attemptsLeft) => {
    const selector = `#${highlightId}, [data-row-id="${highlightId}"], [data-id="${highlightId}"]`;
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-amber-400', 'bg-amber-50', 'transition-all', 'duration-500');
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-amber-400', 'bg-amber-50');
      }, 4000);
    } else if (attemptsLeft > 0) {
      setTimeout(() => attemptHighlight(attemptsLeft - 1), 300);
    }
  };

  setTimeout(() => attemptHighlight(3), 200);
}

/**
 * Resolves module and tab, automatically translating any legacy or aliased tab names
 * and inferring the correct module if missing or incorrect.
 */
export function resolveModuleAndTab(targetModule, targetTab) {
  let mod = targetModule;
  let tab = targetTab;

  // If targetModule is explicitly master_data, preserve master_data for safes, bank_accounts, and vehicles
  if (targetModule === 'master_data') {
    if (['safes', 'banks', 'bank_accounts', 'corporate_banks', 'vehicles', 'items', 'suppliers', 'categories', 'finished_products', 'finished_product_categories', 'bom', 'intermediate_bom', 'production_processes', 'warehouses', 'production_workers', 'users', 'system_config'].includes(tab)) {
      return { module: 'master_data', tab: (tab === 'banks' || tab === 'corporate_banks') ? 'bank_accounts' : tab };
    }
  }

  // Resolve known aliases & legacy identifiers
  if (tab === 'po_creation' || tab === 'purchase_orders' || tab === 'po') {
    mod = 'purchases';
    tab = 'orders';
  } else if (tab === 'faulty_fg_return' || tab === 'faulty_fg_returns') {
    mod = 'production';
    tab = 'faulty_fg';
  } else if (tab === 'finished_goods_inward' || tab === 'finished_goods_inwards' || tab === 'fg_inward' || tab === 'fg_inwards') {
    mod = 'production';
    tab = 'fg_inward';
  } else if (tab === 'transfers' || tab === 'stock_transfers') {
    mod = 'purchases';
    tab = 'transfers';
  } else if (tab === 'receipts' || tab === 'goods_receipts') {
    mod = 'purchases';
    tab = 'receipts';
  } else if (tab === 'liquid_tanks' || tab === 'tanks') {
    mod = 'production';
    tab = 'liquid_tanks';
  } else if (tab === 'work_orders') {
    mod = 'production';
    tab = 'work_orders';
  } else if (tab === 'vehicles' || tab === 'fleet' || tab === 'trucks') {
    mod = 'master_data';
    tab = 'vehicles';
  } else if (tab === 'safes' || tab === 'safes_master' || tab === 'cash_safes_master') {
    mod = 'master_data';
    tab = 'safes';
  } else if (tab === 'bank_accounts' || tab === 'corporate_banks') {
    mod = 'master_data';
    tab = 'bank_accounts';
  } else if (tab === 'banks') {
    if (targetModule === 'master_data') {
      mod = 'master_data';
      tab = 'bank_accounts';
    } else {
      mod = 'finance';
      tab = 'banks';
    }
  } else if (tab === 'cash_safes' || tab === 'cash' || tab === 'cash_safes_hub') {
    mod = 'finance';
    tab = 'cash_safes';
  } else if (tab === 'custodies_advances' || tab === 'custodies' || tab === 'advances') {
    mod = 'finance';
    tab = 'cash_safes';
  } else if (tab === 'accounts' || tab === 'general_ledger') {
    mod = 'finance';
    tab = 'accounts';
  } else if (tab === 'financial_statements') {
    mod = 'finance';
    tab = 'financial_statements';
  } else if (tab === 'party_statements' || tab === 'partner_statements' || tab === 'statements') {
    mod = 'finance';
    tab = 'party_statements';
  } else if (tab === 'dues_tracking' || tab === 'dues') {
    mod = 'finance';
    tab = 'dues_tracking';
  }

  // Infer module if missing or general/landing
  if (!mod || mod === 'landing') {
    const purchasesTabs = ['orders', 'receipts', 'transfers', 'stock', 'stock_count', 'spare_parts'];
    const productionTabs = ['work_orders', 'liquid_tanks', 'liquid_storage', 'faulty_fg', 'fg_inward', 'production_reports'];
    const masterTabs = ['items', 'suppliers', 'categories', 'finished_products', 'finished_product_categories', 'bom', 'intermediate_bom', 'production_processes', 'warehouses', 'safes', 'banks', 'vehicles', 'production_workers', 'users', 'system_config'];
    const financeTabs = ['cash_safes', 'cash_safes_hub', 'custodies_advances', 'dues_tracking', 'banks', 'accounts', 'party_statements', 'financial_statements'];

    if (purchasesTabs.includes(tab)) {
      mod = 'purchases';
    } else if (productionTabs.includes(tab)) {
      mod = 'production';
    } else if (masterTabs.includes(tab)) {
      mod = 'master_data';
    } else if (financeTabs.includes(tab)) {
      mod = 'finance';
    }
  }

  return { module: mod || 'purchases', tab: tab || 'orders' };
}

// =========================================================================
// 2. DESKTOP & MOBILE WEB NOTIFICATIONS (Service Worker & Notifications API)
// =========================================================================

/**
 * Registers the background Service Worker for Push and offline notification handlers.
 */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });
    console.debug('ServiceWorker registered successfully with scope:', registration.scope);
    return registration;
  } catch (error) {
    console.debug('ServiceWorker registration omitted or failed:', error);
    return null;
  }
}

/**
 * Requests Notification permission from the browser.
/**
 * Registers an FCM Web Push Token for the current user in Firestore.
 * This token enables Firebase Cloud Functions to wake the phone and trigger
 * notifications even when the screen is locked/off.
 */
export async function registerFcmPushToken(userId) {
  if (typeof window === 'undefined' || !userId) return null;
  if (!('Notification' in window) || Notification.permission !== 'granted') return null;

  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const swReg = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BMx-PLACEHOLDER-VAPID-KEY';

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      console.debug('[FCM] Push token registered for user:', userId);
      const userRef = doc(db, 'users', userId);
      await setDoc(
        userRef,
        {
          fcmTokens: arrayUnion(token),
          lastPushTokenRefresh: serverTimestamp()
        },
        { merge: true }
      );
      return token;
    }
  } catch (error) {
    console.debug('[FCM] Token registration note (VAPID key required for off-screen push):', error.message);
  }
  return null;
}

/**
 * Diagnostic helper that checks if Push Notifications are supported on the current device.
 * Handles Apple iOS PWA rules and HTTPS security requirements.
 */
export function checkPushNotificationSupport() {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'no_window' };
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator?.userAgent || '') ||
    (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);

  const isSecure = window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;

  if (!isSecure) {
    return {
      supported: false,
      reason: 'insecure_origin', // Not HTTPS - iOS & mobile browsers disable ServiceWorker & Notification
      isIOS,
      isStandalone
    };
  }

  if (isIOS && !isStandalone) {
    return {
      supported: false,
      reason: 'ios_not_homescreen', // Apple iOS strictly requires adding to Home Screen first
      isIOS,
      isStandalone
    };
  }

  if (!('Notification' in window)) {
    return {
      supported: false,
      reason: 'no_notification_api',
      isIOS,
      isStandalone
    };
  }

  return {
    supported: true,
    reason: 'supported',
    isIOS,
    isStandalone,
    permission: Notification.permission
  };
}

/**
 * Requests Notification permission from the browser.
 * Returns { success, permission, reason, support }.
 */
export async function requestNotificationPermission(userId = null) {
  const support = checkPushNotificationSupport();
  if (!support.supported) {
    console.debug('[Notifications] Push not supported:', support.reason);
    return { success: false, reason: support.reason, support };
  }

  // Also prompt OneSignal subscription registration
  requestOneSignalPermission().catch(() => {});

  if (Notification.permission === 'granted') {
    if (userId) registerFcmPushToken(userId);
    return { success: true, permission: 'granted', support };
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        if (userId) registerFcmPushToken(userId);
        requestOneSignalPermission().catch(() => {});
        // Send immediate welcome test alert to confirm delivery on mobile
        showDesktopNotification({
          title: 'Al-Tawoos ERP | الطاووس',
          body: 'تم تفعيل إشعارات الهاتف بنجاح ✓ | Mobile notifications enabled'
        });
      }
      return { success: permission === 'granted', permission, support };
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      return { success: false, reason: 'error', error: e.message, support };
    }
  }

  return { success: false, reason: 'denied', permission: Notification.permission, support };
}

/**
 * Displays an OS-level notification outside or inside the ERP window.
 * HIGH COMPATIBILITY FOR MOBILE PHONES:
 * - Uses ServiceWorkerRegistration.showNotification() as primary method (mandatory on Android Chrome & mobile PWAs).
 * - Fallbacks to client postMessage to active Service Worker.
 * - Fallbacks to native Notification constructor for Mac/Windows desktop browsers.
 */
export async function showDesktopNotification({
  title,
  body,
  tag = 'tawoos_erp_alert',
  targetTab = '',
  highlightId = '',
  targetModule = '',
  onClick = null
}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission !== 'granted') return;

  const targetUrl = targetTab ? `/#tab=${targetTab}${highlightId ? `&highlight=${highlightId}` : ''}` : '/';

  const options = {
    body: body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: tag || 'tawoos_erp_alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: targetUrl,
      targetTab,
      highlightId,
      targetModule
    }
  };

  // 1. PRIMARY FOR MOBILE (Android Chrome / Mobile Browsers / PWA):
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title || 'Al-Tawoos ERP', options);
        return;
      }
    } catch (swErr) {
      console.debug('[Notifications] SW showNotification failed, trying postMessage fallback:', swErr);
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: title || 'Al-Tawoos ERP',
          options
        });
        return;
      }
    }
  }

  // 2. DESKTOP FALLBACK (Standard Web Notification constructor for PC / Mac)
  try {
    const notification = new Notification(title || 'Al-Tawoos ERP', options);
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      if (typeof onClick === 'function') {
        onClick();
      } else if (targetTab) {
        window.location.hash = `#tab=${targetTab}${highlightId ? `&highlight=${highlightId}` : ''}`;
      }
      notification.close();
    };
  } catch (err) {
    console.debug('[Notifications] Desktop notification constructor error:', err);
  }
}

// =========================================================================
// 3. FIRESTORE ACTIONS QUEUE (user_actions_queue)
// =========================================================================

/**
 * Deterministically formats a static snapshot time for an action or notification.
 * Does NOT behave like an updating stopwatch; freezes the static trigger moment.
 * Displays "hh:mm A" for today's items (e.g. 10:45 AM / 10:45 ص),
 * or "DD/MM hh:mm A" if triggered on an earlier date.
 */
export function formatStaticTriggerTime(ts, isAr = false) {
  if (!ts) return '';
  let dateObj = null;

  try {
    if (ts?.toDate && typeof ts.toDate === 'function') {
      dateObj = ts.toDate();
    } else if (ts?.toMillis && typeof ts.toMillis === 'function') {
      dateObj = new Date(ts.toMillis());
    } else if (typeof ts === 'object' && ts?.seconds !== undefined) {
      dateObj = new Date(ts.seconds * 1000);
    } else if (typeof ts === 'number') {
      dateObj = new Date(ts);
    } else if (typeof ts === 'string') {
      dateObj = new Date(ts);
    } else if (ts instanceof Date) {
      dateObj = ts;
    }
  } catch (e) {
    console.debug('Error parsing static trigger time:', e);
    return '';
  }

  if (!dateObj || isNaN(dateObj.getTime())) return '';

  const now = new Date();
  const isSameDay =
    dateObj.getDate() === now.getDate() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getFullYear() === now.getFullYear();

  const timeStr = dateObj.toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  if (isSameDay) {
    return timeStr;
  }

  const dateStr = dateObj.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
    month: 'numeric',
    day: 'numeric'
  });
  return `${dateStr} ${timeStr}`;
}

/**
 * Creates an Action Required entry in `user_actions_queue`.
 * Uses a deterministic docId `${actionType}_${docId}` for idempotency.
 * HARDENED: Preserves original createdAt so static timestamp snapshot is never overwritten.
 */
export async function createActionRequired({
  actionType,
  docId,
  docNumber,
  title,
  titleEn = '',
  message,
  messageEn = '',
  targetTab,
  targetModule,
  highlightId,
  createdBy,
  createdByName,
  targetUserId = null,
  targetUserIds = [],
  targetRoles = [],
  createdAt = null,
  metadata = {}
}) {
  if (!actionType || !docId) {
    console.error('createActionRequired missing actionType or docId');
    return;
  }

  const queueId = `${actionType}_${docId}`;
  const actionDocRef = doc(db, 'user_actions_queue', queueId);

  try {
    const existingSnap = await getDoc(actionDocRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      // If it already completed or cancelled, do not revert to pending
      if (existingData.status === 'completed' || existingData.status === 'cancelled') {
        return;
      }

      // If pending, update text and routing details WITHOUT touching the original createdAt!
      await setDoc(
        actionDocRef,
        {
          title: title || existingData.title,
          titleEn: titleEn || existingData.titleEn,
          message: message || existingData.message,
          messageEn: messageEn || existingData.messageEn,
          targetTab: targetTab || existingData.targetTab,
          targetModule: targetModule || existingData.targetModule,
          targetUserId: targetUserId !== undefined ? targetUserId : existingData.targetUserId,
          targetUserIds: Array.isArray(targetUserIds) && targetUserIds.length > 0
            ? targetUserIds
            : (existingData.targetUserIds || []),
          targetRoles: Array.isArray(targetRoles) && targetRoles.length > 0
            ? targetRoles
            : existingData.targetRoles,
          metadata: { ...(existingData.metadata || {}), ...(metadata || {}) }
        },
        { merge: true }
      );
      return;
    }

    // New action document: set the static snapshot createdAt once
    const resolvedUserIds = Array.isArray(targetUserIds) && targetUserIds.length > 0
      ? targetUserIds
      : (targetUserId ? [targetUserId] : []);

    const payload = {
      id: queueId,
      actionType,
      docId,
      docNumber: docNumber || docId,
      title: title || 'إجراء مطلوب',
      titleEn: titleEn || 'Action Required',
      message: message || '',
      messageEn: messageEn || '',
      targetTab: targetTab || '',
      targetModule: targetModule || '',
      highlightId: highlightId || docId,
      createdBy: createdBy || 'system',
      createdByName: createdByName || 'System',
      targetUserId: targetUserId || null,
      targetUserIds: resolvedUserIds,
      targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
      status: 'pending',
      createdAt: createdAt || serverTimestamp(),
      completedBy: null,
      completedByName: null,
      completedAt: null,
      resolutionNote: null,
      metadata: metadata || {}
    };

    await setDoc(actionDocRef, payload);
    console.debug(`[ActionQueue] Created action ${queueId}`);

    // Dispatch OneSignal Web Push to wake recipient phones (100% free on Spark plan)
    sendOneSignalPush({
      targetUserId,
      targetUserIds,
      targetRoles,
      title: title || 'إجراء واعتماد مطلوب',
      message: message || `مطلوب اعتماد مستند: ${docNumber || docId}`,
      url: targetTab ? `/#tab=${targetTab}${highlightId ? `&highlight=${highlightId}` : ''}` : '/',
      docId,
      actionType
    }).catch(() => {});
  } catch (error) {
    console.error(`[ActionQueue] Error creating action ${queueId}:`, error);
  }
}

/**
 * Marks an Action Required entry as completed.
 */
export async function completeActionRequired({
  actionType,
  docId,
  completedBy,
  completedByName,
  resolutionNote = ''
}) {
  if (!docId) return;

  try {
    const nowIso = new Date().toISOString();
    const updatePayload = {
      status: 'completed',
      completedBy: completedBy || 'unknown',
      completedByName: completedByName || '',
      completedAt: nowIso,
      resolutionNote: resolutionNote || null
    };

    const updates = [];

    // 1. If explicit actionType was provided, update direct queueId document
    if (actionType) {
      const queueId = `${actionType}_${docId}`;
      const actionDocRef = doc(db, 'user_actions_queue', queueId);
      updates.push(setDoc(actionDocRef, updatePayload, { merge: true }));
    }

    // 2. Also search for ANY pending actions referencing this docId to prevent orphaned duplicates
    const q = query(
      collection(db, 'user_actions_queue'),
      where('docId', '==', docId),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      updates.push(setDoc(docSnap.ref, updatePayload, { merge: true }));
    });

    await Promise.all(updates);
    console.debug(`[ActionQueue] Completed actions for docId: ${docId}`);

    // 3. Dual-Sync: If this action is a comment task, resolve the corresponding comment thread
    if (actionType === 'comment_task' || docId.startsWith('th_')) {
      try {
        const commentDocRef = doc(db, 'record_comments', docId);
        const commentSnap = await getDoc(commentDocRef);
        if (commentSnap.exists() && commentSnap.data().status !== 'resolved') {
          await updateDoc(commentDocRef, {
            status: 'resolved',
            resolvedAt: nowIso,
            resolvedBy: completedBy || 'system',
            resolvedByName: completedByName || 'System',
            resolutionNote: resolutionNote || 'تم الاعتماد عبر قائمة الإجراءات المطلوبة'
          });
          console.debug(`[ActionQueue] Dual-Sync: Resolved comment thread ${docId}`);
        }
      } catch (commentErr) {
        console.debug('[ActionQueue] Dual-Sync comment resolution omitted:', commentErr);
      }
    }
  } catch (error) {
    console.error(`[ActionQueue] Error completing action for docId ${docId}:`, error);
  }
}

/**
 * Cancels an Action Required entry (e.g. if the source document was cancelled or deleted).
 */
export async function cancelActionRequired({ actionType, docId, cancelledBy, note = '' }) {
  if (!docId) return;

  try {
    const nowIso = new Date().toISOString();
    const cancelPayload = {
      status: 'cancelled',
      cancelledBy: cancelledBy || 'unknown',
      cancelledAt: nowIso,
      resolutionNote: note || null
    };

    const updates = [];

    if (actionType) {
      const queueId = `${actionType}_${docId}`;
      const actionDocRef = doc(db, 'user_actions_queue', queueId);
      updates.push(setDoc(actionDocRef, cancelPayload, { merge: true }));
    }

    const q = query(
      collection(db, 'user_actions_queue'),
      where('docId', '==', docId),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      updates.push(setDoc(docSnap.ref, cancelPayload, { merge: true }));
    });

    await Promise.all(updates);
  } catch (error) {
    console.error(`[ActionQueue] Error cancelling action for docId ${docId}:`, error);
  }
}

// =========================================================================
// 4. FIRESTORE NOTIFICATIONS (system_notifications)
// =========================================================================

/**
 * Creates an informational Notification entry in `system_notifications`.
 */
export async function createNotification({
  type = 'info', // 'info' | 'success' | 'warning' | 'action_completed'
  title,
  titleEn = '',
  message,
  messageEn = '',
  targetUserId = null,
  targetUserIds = [],
  targetRoles = [],
  targetTab = '',
  targetModule = '',
  highlightId = '',
  createdBy = 'system',
  createdByName = 'System',
  metadata = {}
}) {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const notifDocRef = doc(db, 'system_notifications', notifId);

  const resolvedUserIds = Array.isArray(targetUserIds) && targetUserIds.length > 0
    ? targetUserIds
    : (targetUserId ? [targetUserId] : []);

  const payload = {
    id: notifId,
    type,
    title: title || 'إشعار جديد',
    titleEn: titleEn || 'New Notification',
    message: message || '',
    messageEn: messageEn || '',
    targetUserId: targetUserId || (resolvedUserIds[0] || null),
    targetUserIds: resolvedUserIds,
    targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
    targetTab: targetTab || '',
    targetModule: targetModule || '',
    highlightId: highlightId || '',
    createdBy: createdBy || 'system',
    createdByName: createdByName || 'System',
    readBy: [],
    createdAt: serverTimestamp(),
    metadata: metadata || {}
  };

  try {
    await setDoc(notifDocRef, payload);
    console.debug(`[Notifications] Created notification ${notifId}`);

    // Dispatch OneSignal Web Push to wake recipient phones (100% free on Spark plan)
    sendOneSignalPush({
      targetUserId,
      targetUserIds: resolvedUserIds,
      targetRoles,
      title: title || 'إشعار جديد | New Notification',
      message: message || '',
      url: targetTab ? `/#tab=${targetTab}${highlightId ? `&highlight=${highlightId}` : ''}` : '/',
      docId: highlightId || notifId,
      actionType: type
    }).catch(() => {});

    return notifId;
  } catch (error) {
    console.error('[Notifications] Error creating notification:', error);
    return null;
  }
}

/**
 * Marks a notification as read by the specified user.
 */
export async function markNotificationAsRead(notificationId, userId) {
  if (!notificationId || !userId) return;

  try {
    const notifDocRef = doc(db, 'system_notifications', notificationId);
    await updateDoc(notifDocRef, {
      readBy: arrayUnion(userId)
    });
  } catch (error) {
    console.error(`[Notifications] Error marking notification ${notificationId} as read:`, error);
  }
}

/**
 * Marks multiple notifications as read by the user in bulk ("Mark All as Read").
 */
export async function markAllNotificationsAsRead(notificationIds, userId) {
  if (!Array.isArray(notificationIds) || notificationIds.length === 0 || !userId) return;

  try {
    const updates = notificationIds.map((id) =>
      updateDoc(doc(db, 'system_notifications', id), {
        readBy: arrayUnion(userId)
      }).catch((e) => console.error(`Error marking ${id} read:`, e))
    );
    await Promise.all(updates);
  } catch (error) {
    console.error('[Notifications] Error in markAllNotificationsAsRead:', error);
  }
}

// =========================================================================
// 5. RECONCILIATION & BOOT BACKFILL HELPERS
// =========================================================================

/**
 * Scans `user_actions_queue` where `status == 'pending'` and reconciles against the source business collections.
 * - If the source record is already completed, accepted, verified, closed, or cancelled, marks the action completed.
 * - If the source record no longer exists, marks the action cancelled.
 * - If an action for finished goods was mistakenly created with targetTab: 'transfers', heals the routing to 'fg_inward'.
 */
export async function reconcilePendingActions() {
  try {
    const q = query(
      collection(db, 'user_actions_queue'),
      where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    for (const actionDoc of snap.docs) {
      const act = actionDoc.data();
      const docId = act.docId;
      if (!docId) continue;

      // 1. Stock Transfers / FG Inward
      if (
        act.actionType === 'stock_transfer_verification' ||
        act.actionType === 'fg_inward_verification' ||
        act.targetTab === 'transfers' ||
        act.targetTab === 'fg_inward'
      ) {
        try {
          const trnSnap = await getDoc(doc(db, 'stock_transfers', docId));
          if (!trnSnap.exists()) {
            await setDoc(actionDoc.ref, {
              status: 'cancelled',
              resolutionNote: 'Document no longer exists in stock_transfers'
            }, { merge: true });
            continue;
          }
          const trn = trnSnap.data();
          if (
            trn.status === 'completed' ||
            trn.status === 'verified' ||
            trn.status === 'rejected' ||
            trn.status === 'cancelled'
          ) {
            await setDoc(actionDoc.ref, {
              status: 'completed',
              completedAt: new Date().toISOString(),
              resolutionNote: `Auto-reconciled: Source transfer is ${trn.status}`
            }, { merge: true });
            continue;
          }

          // Self-heal FG routing if pointed to transfers
          const isFG =
            trn.isFinishedGoods ||
            trn.transferType === 'finished_goods' ||
            trn.transferCategory === 'finished_goods' ||
            trn.targetWarehouse === 'wh_fg' ||
            (typeof trn.targetWarehouse === 'string' && trn.targetWarehouse.toLowerCase().includes('fg'));

          if (isFG && act.targetTab !== 'fg_inward') {
            await setDoc(actionDoc.ref, {
              targetTab: 'fg_inward',
              targetModule: 'production',
              actionType: 'fg_inward_verification',
              title: `مطلوب فحص واستلام باليتات منتج تام: ${docId}`,
              titleEn: `Finished Goods Inward Verification Required: ${docId}`
            }, { merge: true });
          }
        } catch (e) {
          console.debug('[Reconcile] Error checking transfer doc:', e);
        }
      }

      // 2. Purchase Orders
      else if (act.actionType === 'po_approval' || act.targetTab === 'orders') {
        try {
          const poSnap = await getDoc(doc(db, 'purchase_orders', docId));
          if (!poSnap.exists()) {
            await setDoc(actionDoc.ref, {
              status: 'cancelled',
              resolutionNote: 'PO no longer exists'
            }, { merge: true });
            continue;
          }
          const po = poSnap.data();
          if (
            po.status === 'approved' ||
            po.status === 'received' ||
            po.status === 'partially_received' ||
            po.status === 'closed' ||
            po.status === 'cancelled'
          ) {
            await setDoc(actionDoc.ref, {
              status: 'completed',
              completedAt: new Date().toISOString(),
              resolutionNote: `Auto-reconciled: Source PO is ${po.status}`
            }, { merge: true });
          }
        } catch (e) {
          console.debug('[Reconcile] Error checking po doc:', e);
        }
      }

      // 3. Faulty FG Returns
      else if (act.actionType === 'faulty_fg_floor_confirm' || act.targetTab === 'faulty_fg') {
        try {
          const retSnap = await getDoc(doc(db, 'faulty_fg_returns', docId));
          if (!retSnap.exists()) {
            await setDoc(actionDoc.ref, {
              status: 'cancelled',
              resolutionNote: 'Return doc no longer exists'
            }, { merge: true });
            continue;
          }
          const ret = retSnap.data();
          if (
            ret.status === 'completed' ||
            ret.status === 'accepted' ||
            ret.status === 'rejected' ||
            ret.status === 'cancelled'
          ) {
            await setDoc(actionDoc.ref, {
              status: 'completed',
              completedAt: new Date().toISOString(),
              resolutionNote: `Auto-reconciled: Source Return is ${ret.status}`
            }, { merge: true });
          }
        } catch (e) {
          console.debug('[Reconcile] Error checking return doc:', e);
        }
      }
    }
  } catch (error) {
    console.debug('[Reconcile] Error during pending actions reconciliation:', error);
  }
}

/**
 * Scans core collections for any pending transactions that pre-existed this feature
 * and ensures they have active entries in `user_actions_queue`.
 * First reconciles existing actions to unpin any stuck/already-completed items.
 * Runs quietly in the background on initial app mount without blocking.
 */
export async function backfillPendingActions() {
  try {
    // Step 0: Auto-reconcile existing actions to resolve any stuck/completed documents
    await reconcilePendingActions();

    // 1. Pending Purchase Orders (status: 'pending' or 'pending_adjustments')
    const poQuery = query(
      collection(db, 'purchase_orders'),
      where('status', 'in', ['pending', 'pending_adjustments'])
    );
    const poSnap = await getDocs(poQuery);
    for (const poDoc of poSnap.docs) {
      const data = poDoc.data();
      const isAdjustment = data.status === 'pending_adjustments';
      await createActionRequired({
        actionType: 'po_approval',
        docId: poDoc.id,
        docNumber: poDoc.id,
        title: isAdjustment
          ? `مطلوب تعديل أمر شراء: ${poDoc.id}`
          : `مطلوب اعتماد أمر شراء: ${poDoc.id}`,
        titleEn: isAdjustment
          ? `Adjustments Requested: ${poDoc.id}`
          : `PO Approval Required: ${poDoc.id}`,
        message: isAdjustment
          ? `طلب (${data.adjustmentRequestedBy || 'الإدارة'}): ${data.latestAdjustmentComment || 'مراجعة البنود'}`
          : `أمر شراء بقيمة ${data.financials?.netTotalWithTax || '0'} ج.م بانتظار الاعتماد للتوريد`,
        messageEn: isAdjustment
          ? `Adjustment note: ${data.latestAdjustmentComment || 'Review items'}`
          : `PO awaiting approval for warehouse delivery`,
        targetTab: 'orders',
        targetModule: 'purchases',
        highlightId: poDoc.id,
        createdBy: data.createdBy || 'system',
        createdByName: data.createdBy || 'Purchasing Specialist',
        targetUserId: isAdjustment ? (data.createdById || data.createdBy) : null,
        targetRoles: isAdjustment
          ? ['purchasing_specialist', 'purchasing_manager', 'general_admin']
          : ['general_admin', 'purchasing_manager'],
        createdAt: data.createdAt || data.date || null
      });
    }

    // 2. Pending Stock Transfers (status: 'pending_custodian_verification' or 'pending_admin_verification')
    const trnQuery = query(
      collection(db, 'stock_transfers'),
      where('status', 'in', ['pending_custodian_verification', 'pending_admin_verification'])
    );
    const trnSnap = await getDocs(trnQuery);
    for (const trnDoc of trnSnap.docs) {
      const data = trnDoc.data();
      const isAdminOnly = data.status === 'pending_admin_verification';
      const isFG =
        data.isFinishedGoods ||
        data.transferType === 'finished_goods' ||
        data.transferCategory === 'finished_goods' ||
        data.targetWarehouse === 'wh_fg' ||
        (typeof data.targetWarehouse === 'string' && data.targetWarehouse.toLowerCase().includes('fg'));

      const resolvedUserIds = Array.isArray(data.allowedVerifierIds) && data.allowedVerifierIds.length > 0
        ? data.allowedVerifierIds
        : (data.requiredVerifierId ? [data.requiredVerifierId] : []);

      await createActionRequired({
        actionType: isFG ? 'fg_inward_verification' : 'stock_transfer_verification',
        docId: trnDoc.id,
        docNumber: trnDoc.id,
        title: isFG
          ? `مطلوب فحص واستلام باليتات منتج تام: ${trnDoc.id}`
          : `مطلوب تأكيد استلام تحويل مخزني: ${trnDoc.id}`,
        titleEn: isFG
          ? `Finished Goods Inward Verification Required: ${trnDoc.id}`
          : `Stock Transfer Verification Required: ${trnDoc.id}`,
        message: `من [${data.sourceWarehouse}] إلى [${data.targetWarehouse}]`,
        messageEn: `From [${data.sourceWarehouse}] to [${data.targetWarehouse}]`,
        targetTab: isFG ? 'fg_inward' : 'transfers',
        targetModule: isFG ? 'production' : 'purchases',
        highlightId: trnDoc.id,
        createdBy: data.issuedById || data.issuedBy || 'system',
        createdByName: data.issuedBy || 'Warehouse Staff',
        targetUserId: data.requiredVerifierId || null,
        targetUserIds: resolvedUserIds,
        targetRoles: isAdminOnly
          ? ['general_admin']
          : (isFG
              ? ['general_admin', 'finished_goods_custodian', 'warehouse_keeper', 'storekeeper']
              : ['general_admin', 'warehouse_keeper', 'storekeeper']),
        createdAt: data.createdAt || data.transferDate || null
      });
    }

    // 3. Pending Faulty FG Returns (status: 'pending_acceptance')
    const fgReturnQuery = query(
      collection(db, 'faulty_fg_returns'),
      where('status', '==', 'pending_acceptance')
    );
    const fgReturnSnap = await getDocs(fgReturnQuery);
    for (const retDoc of fgReturnSnap.docs) {
      const data = retDoc.data();
      await createActionRequired({
        actionType: 'faulty_fg_floor_confirm',
        docId: retDoc.id,
        docNumber: retDoc.id,
        title: `مطلوب استلام مرتجع معيب بصالة الإنتاج: ${retDoc.id}`,
        titleEn: `Floor Acceptance Required for Faulty FG: ${retDoc.id}`,
        message: `تم إصدار إذن ارتجاع معيبات ويجب استلام العهدة في صالة الإنتاج`,
        messageEn: `Faulty products returned; requires floor acceptance and custody takeover`,
        targetTab: 'faulty_fg',
        targetModule: 'production',
        highlightId: retDoc.id,
        createdBy: data.issuedById || data.issuedBy || 'system',
        createdByName: data.issuedBy || 'QA/Storekeeper',
        targetRoles: ['general_admin', 'production_supervisor', 'production_manager', 'standard'],
        createdAt: data.createdAt || data.submittedBy?.submittedAt || null
      });
    }

    console.debug('[ActionQueue] Backfill & reconciliation completed successfully.');
  } catch (error) {
    console.debug('[ActionQueue] Backfill notice:', error);
  }
}
