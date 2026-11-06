/**
 * OneSignal Web Push Integration Engine for Al-Tawoos ERP
 * Enables 100% Free Mobile & Desktop Web Push Notifications (including screen-off / locked state)
 * without requiring Firebase Cloud Functions or the Firebase Blaze plan.
 */
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';
export const ONESIGNAL_REST_API_KEY = import.meta.env.VITE_ONESIGNAL_REST_API_KEY || '';

let isInitialized = false;
let initPromise = null;

/**
 * Detects the client's operating system, device family, and PWA standalone status.
 */
export function detectDeviceName() {
  if (typeof window === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  const isAndroid = /Android/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
  const isWindows = /Windows/i.test(ua);

  if (isIOS) {
    return isStandalone ? 'iPhone (PWA Standalone)' : 'iPhone (Safari)';
  }
  if (isAndroid) {
    return isStandalone ? 'Android (PWA App)' : 'Android (Chrome)';
  }
  if (isMac) {
    return 'MacBook / Mac OS';
  }
  if (isWindows) {
    return 'Windows PC';
  }
  return 'Desktop Browser';
}

/**
 * Checks whether OneSignal is configured with an App ID.
 */
export function isOneSignalConfigured() {
  return Boolean(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
}

/**
 * Returns current device's OneSignal subscription ID and push token.
 */
export async function getOneSignalDeviceSubscription() {
  if (typeof window === 'undefined') return null;
  const OneSignal = await initOneSignal();
  if (!OneSignal) return null;

  try {
    let sub = OneSignal.User?.pushSubscription;
    // Wait briefly if it's hydrating
    if (!sub?.id && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      let attempts = 0;
      while (!OneSignal.User?.pushSubscription?.id && attempts < 6) {
        await new Promise((r) => setTimeout(r, 200));
        attempts++;
      }
      sub = OneSignal.User?.pushSubscription;
    }

    const subId = sub?.id || null;
    const pushToken = sub?.token || null;
    const optedIn = sub?.optedIn || false;
    const permission = OneSignal.Notifications?.permission || (typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false);
    return {
      subscriptionId: subId,
      pushToken,
      optedIn,
      permission,
      deviceType: detectDeviceName()
    };
  } catch (e) {
    console.debug('[OneSignal] getSubscription note:', e);
    return null;
  }
}

/**
 * Fetches all registered device players directly from OneSignal Cloud
 * and reconciles their Subscription IDs, device types, and push status in Firestore.
 */
export async function syncOneSignalDevicesWithFirestore() {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) return { success: false, reason: 'unconfigured' };

  try {
    const res = await fetch(`https://api.onesignal.com/players?app_id=${ONESIGNAL_APP_ID}&limit=300`, {
      headers: {
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`
      }
    });

    if (!res.ok) {
      console.warn('[OneSignal] Failed to fetch players:', res.status);
      return { success: false, status: res.status };
    }

    const data = await res.json();
    const players = data.players || [];
    console.debug('[OneSignal] Fetched players from cloud:', players.length);

    // Sort players: mobile devices first, then latest active
    const sortedPlayers = [...players].sort((a, b) => {
      const aIsMobile = a.device_model === 'iPhone' || a.device_type === 17 || a.device_type === 1;
      const bIsMobile = b.device_model === 'iPhone' || b.device_type === 17 || b.device_type === 1;
      if (aIsMobile && !bIsMobile) return -1;
      if (!aIsMobile && bIsMobile) return 1;
      return (b.last_active || b.created_at || 0) - (a.last_active || a.created_at || 0);
    });

    const seenUsers = new Set();
    let syncedCount = 0;
    for (const player of sortedPlayers) {
      const userId = player.external_user_id;
      if (!userId || seenUsers.has(userId)) continue;
      seenUsers.add(userId);

      const userRef = doc(db, 'users', userId);
      const isIos = player.device_model === 'iPhone' || player.device_type === 17;
      const isMac = player.device_model === 'MacIntel' || player.device_type === 5;
      const platformName = isIos
        ? 'iPhone (PWA Standalone)'
        : isMac
        ? 'MacBook / Mac OS'
        : (player.device_model || 'Registered Device');

      await setDoc(
        userRef,
        {
          onesignalSubscriptionId: player.id,
          onesignalPushToken: player.identifier || null,
          pushEnabled: !player.invalid_identifier,
          deviceType: platformName,
          deviceLastActive: new Date((player.last_active || player.created_at) * 1000).toISOString()
        },
        { merge: true }
      ).catch((e) => console.warn('[OneSignal] Device sync error for user:', userId, e));

      // If either general admin persona is synced, mirror token to both so either persona works seamlessly
      if (userId === 'usr_general_admin' || userId === 'usr_662444') {
        const altId = userId === 'usr_general_admin' ? 'usr_662444' : 'usr_general_admin';
        await setDoc(
          doc(db, 'users', altId),
          {
            onesignalSubscriptionId: player.id,
            onesignalPushToken: player.identifier || null,
            pushEnabled: !player.invalid_identifier,
            deviceType: platformName,
            deviceLastActive: new Date((player.last_active || player.created_at) * 1000).toISOString()
          },
          { merge: true }
        ).catch(() => {});
      }

      syncedCount++;
    }

    return { success: true, total: players.length, synced: syncedCount, players };
  } catch (err) {
    console.warn('[OneSignal] Cloud device sync error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Explicitly opts the current device into OneSignal push notifications,
 * generating a Subscription ID and storing it in Firestore.
 */
export async function optInOneSignalPush(currentUser = null) {
  if (typeof window === 'undefined') return { success: false, reason: 'no_window' };
  if (!ONESIGNAL_APP_ID) return { success: false, reason: 'missing_app_id' };

  const OneSignal = await initOneSignal();
  if (!OneSignal) return { success: false, reason: 'init_failed' };

  try {
    console.debug('[OneSignal] Requesting optIn()...');

    const activeUserId = currentUser?.id || window.__TAWOOS_CURRENT_USER_ID__;
    if (activeUserId && typeof OneSignal.login === 'function') {
      try {
        if (OneSignal.User?.externalId !== activeUserId) {
          await OneSignal.login(activeUserId);
        }
      } catch (loginErr) {
        console.debug('[OneSignal] login notice:', loginErr);
      }
    }

    // 1. Ensure browser permission is requested
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      await OneSignal.Notifications?.requestPermission?.();
    }

    // 2. Request push subscription opt-in
    await OneSignal.User?.pushSubscription?.optIn?.();

    // 3. Polling for subscription ID generation (up to 15 attempts x 250ms = 3.75s)
    let sub = OneSignal.User?.pushSubscription;
    let attempts = 0;
    while (!sub?.id && attempts < 15) {
      await new Promise((r) => setTimeout(r, 250));
      sub = OneSignal.User?.pushSubscription;
      attempts++;
    }

    let subId = sub?.id || null;
    let pushToken = sub?.token || null;
    let optedIn = sub?.optedIn || false;
    let permission = OneSignal.Notifications?.permission || (typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false);

    // 4. If subId is still null, reconcile with OneSignal Cloud players
    if (!subId) {
      const syncRes = await syncOneSignalDevicesWithFirestore();
      if (syncRes.players && activeUserId) {
        const matchedPlayer = syncRes.players.find((p) => p.external_user_id === activeUserId);
        if (matchedPlayer) {
          subId = matchedPlayer.id;
          pushToken = matchedPlayer.identifier;
          optedIn = !matchedPlayer.invalid_identifier;
        }
      }
    }

    if (activeUserId && subId) {
      const userRef = doc(db, 'users', activeUserId);
      await setDoc(
        userRef,
        {
          onesignalSubscriptionId: subId,
          onesignalPushToken: pushToken || null,
          pushEnabled: true,
          deviceType: detectDeviceName(),
          deviceLastActive: new Date().toISOString()
        },
        { merge: true }
      ).catch((e) => console.warn('[OneSignal] Firestore save error:', e));
    }

    return {
      success: Boolean(subId),
      subscriptionId: subId,
      pushToken,
      optedIn,
      permission,
      deviceType: detectDeviceName()
    };
  } catch (err) {
    console.warn('[OneSignal] optIn error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Initializes the OneSignal Web SDK v16.
 * Returns a singleton Promise that resolves when OneSignal.init() has completely finished.
 */
export function initOneSignal() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!ONESIGNAL_APP_ID) {
    console.debug('[OneSignal] VITE_ONESIGNAL_APP_ID not configured yet.');
    return Promise.resolve(null);
  }
  if (isInitialized && window.OneSignal) {
    return Promise.resolve(window.OneSignal);
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    // 10s fallback in case SDK script is blocked by adblock or network
    const timeoutTimer = setTimeout(() => {
      if (!isInitialized) {
        console.debug('[OneSignal] Init timed out (script may be blocked or loading slowly).');
        safeResolve(null);
      }
    }, 10000);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          notifyButton: {
            enable: false
          }
        });
        isInitialized = true;
        clearTimeout(timeoutTimer);
        console.debug('[OneSignal] Initialized successfully with App ID:', ONESIGNAL_APP_ID);

        // If browser permission is already granted, ensure push subscription opts in automatically!
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          if (!OneSignal.User?.pushSubscription?.id) {
            console.debug('[OneSignal] Auto opting in since permission is granted...');
            OneSignal.User?.pushSubscription?.optIn?.().catch(() => {});
          }
        }

        // Listen for subscription changes and auto-sync
        if (OneSignal.User?.pushSubscription) {
          OneSignal.User.pushSubscription.addEventListener('change', async (event) => {
            const currentSub = event.current;
            console.debug('[OneSignal] Push subscription changed:', currentSub);
            const activeUserId = window.__TAWOOS_CURRENT_USER_ID__;
            if (activeUserId && currentSub?.id) {
              const userRef = doc(db, 'users', activeUserId);
              await setDoc(
                userRef,
                {
                  onesignalSubscriptionId: currentSub.id,
                  onesignalPushToken: currentSub.token || null,
                  pushEnabled: Boolean(currentSub.optedIn),
                  deviceType: detectDeviceName()
                },
                { merge: true }
              ).catch(() => {});
            }
          });
        }

        safeResolve(OneSignal);
      } catch (e) {
        clearTimeout(timeoutTimer);
        console.debug('[OneSignal] Init notice:', e.message);
        safeResolve(null);
      }
    });
  });

  return initPromise;
}

/**
 * Associates the current ERP user with OneSignal (by user ID & role),
 * and records their active device push token/subscription in Firestore.
 * Awaits initOneSignal() to ensure OneSignal.init() has completely finished before login.
 */
export async function syncOneSignalUser(currentUser) {
  if (typeof window === 'undefined' || !currentUser?.id) return;
  window.__TAWOOS_CURRENT_USER_ID__ = currentUser.id;
  if (!ONESIGNAL_APP_ID) return;

  const OneSignal = await initOneSignal();
  if (!OneSignal || !isInitialized) {
    console.debug('[OneSignal] syncOneSignalUser skipped: OneSignal not initialized.');
    return;
  }

  try {
    if (typeof OneSignal.login === 'function') {
      try {
        if (OneSignal.User?.externalId !== currentUser.id) {
          await OneSignal.login(currentUser.id);
        }
      } catch (loginErr) {
        console.debug('[OneSignal] login notice:', loginErr?.message || loginErr);
      }
    }

    if (currentUser.role && OneSignal.User?.addTag) {
      await OneSignal.User.addTag('role', currentUser.role).catch(() => {});
    }
    if ((currentUser.name || currentUser.nameAr) && OneSignal.User?.addTag) {
      await OneSignal.User.addTag('name', currentUser.name || currentUser.nameAr).catch(() => {});
    }

    // If permission is granted, ensure push subscription opts in
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if (!OneSignal.User?.pushSubscription?.id) {
        await OneSignal.User?.pushSubscription?.optIn?.().catch(() => {});
        let attempts = 0;
        while (!OneSignal.User?.pushSubscription?.id && attempts < 8) {
          await new Promise((r) => setTimeout(r, 250));
          attempts++;
        }
      }
    }

    const subId = OneSignal.User?.pushSubscription?.id || null;
    const pushToken = OneSignal.User?.pushSubscription?.token || null;
    const optedIn = OneSignal.User?.pushSubscription?.optedIn || false;
    const permission = OneSignal.Notifications?.permission || (typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false);

    // Guard: Only write to Firestore if we have a valid subId AND it differs from current state!
    // This completely breaks any potential write loop.
    if (currentUser.id && subId) {
      const isAlreadySynced =
        currentUser.onesignalSubscriptionId === subId &&
        currentUser.pushEnabled === Boolean(permission && optedIn) &&
        currentUser.deviceType === detectDeviceName();

      if (isAlreadySynced) {
        return; // Skip write: already perfectly matched!
      }

      const userRef = doc(db, 'users', currentUser.id);
      const updateData = {
        onesignalSubscriptionId: subId,
        onesignalPushToken: pushToken || null,
        pushEnabled: Boolean(permission && optedIn),
        deviceType: detectDeviceName()
      };
      await setDoc(userRef, updateData, { merge: true }).catch(() => {});
    }

    console.debug('[OneSignal] User synced:', currentUser.id, 'subId:', subId);
  } catch (e) {
    console.debug('[OneSignal] User sync note:', e?.message || e);
  }
}

/**
 * Prompts user for native push notification permission via OneSignal.
 */
export async function requestOneSignalPermission() {
  if (typeof window === 'undefined') return false;
  if (!ONESIGNAL_APP_ID) return false;

  const OneSignal = await initOneSignal();
  if (!OneSignal) return false;

  try {
    await OneSignal.Notifications?.requestPermission?.();
    const hasPerm = OneSignal.Notifications?.permission;
    if (hasPerm) {
      await OneSignal.User?.pushSubscription?.optIn?.();
    }
    return Boolean(hasPerm);
  } catch (e) {
    console.debug('[OneSignal] Permission request error:', e);
    return false;
  }
}

/**
 * Dispatches an instant Web Push notification directly via OneSignal REST API.
 * Wakes the recipient's phone with sound and vibration even when the screen is locked/off!
 * Runs 100% free on Firebase Spark plan (no Cloud Functions required).
 */
export async function sendOneSignalPush({
  includeSubscriptionIds = [],
  targetUserId = null,
  targetUserIds = [],
  targetRoles = [],
  sendToAll = false,
  title = 'Al-Tawoos ERP | الطاووس',
  message = '',
  url = '/',
  docId = '',
  actionType = ''
}) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.warn('[OneSignal] Push skipped: VITE_ONESIGNAL_APP_ID or VITE_ONESIGNAL_REST_API_KEY missing.');
    return { success: false, error: 'OneSignal API keys not configured in .env' };
  }

  const resolvedUserIds = [
    ...(Array.isArray(targetUserIds) ? targetUserIds : []),
    ...(targetUserId ? [targetUserId] : [])
  ].filter(Boolean);

  // If general_admin is included in targetRoles, ensure both general admin user IDs are included
  if (Array.isArray(targetRoles) && targetRoles.includes('general_admin')) {
    if (!resolvedUserIds.includes('usr_general_admin')) resolvedUserIds.push('usr_general_admin');
    if (!resolvedUserIds.includes('usr_662444')) resolvedUserIds.push('usr_662444');
  }

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = url.startsWith('http') ? url : `${originUrl}${url}`;

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    headings: {
      en: title,
      ar: title
    },
    contents: {
      en: message || 'إشعار جديد أو إجراء مطلوب في النظام',
      ar: message || 'إشعار جديد أو إجراء مطلوب في النظام'
    },
    url: fullUrl,
    data: {
      url: fullUrl,
      docId: docId || '',
      actionType: actionType || ''
    },
    chrome_web_icon: `${originUrl}/favicon.svg`,
    chrome_web_badge: `${originUrl}/favicon.svg`,
    priority: 10
  };

  // Targeting Strategy: OneSignal does NOT allow mixing include_subscription_ids, include_aliases, filters, or included_segments
  if (Array.isArray(includeSubscriptionIds) && includeSubscriptionIds.length > 0) {
    payload.include_subscription_ids = includeSubscriptionIds;
  } else if (!sendToAll && resolvedUserIds.length > 0) {
    payload.include_aliases = {
      external_id: resolvedUserIds
    };
    payload.target_channel = 'push';
  } else if (!sendToAll && Array.isArray(targetRoles) && targetRoles.length > 0) {
    payload.filters = targetRoles.flatMap((role, idx) => [
      ...(idx > 0 ? [{ operator: 'OR' }] : []),
      { field: 'tag', key: 'role', relation: '=', value: role }
    ]);
  } else if (sendToAll) {
    // Broadcast to all subscribed devices only when explicitly requested
    payload.included_segments = ['Total Subscriptions'];
  } else {
    // If not sendToAll and no specific user/role targets exist, abort to protect privacy & audience isolation
    console.debug('[OneSignal] Push skipped: No targeted recipients and sendToAll is false.');
    return { success: false, reason: 'no_targets' };
  }

  // Resilient multi-endpoint dispatcher:
  // 1. CORS Proxy Relay (bypasses browser CORS preflight restrictions on live web origins)
  // 2. Local Vite dev proxy (when running on localhost/port 3000)
  // 3. Direct OneSignal API
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.port === '3000'
  );

  const endpoints = [
    'https://api.onesignal.com/notifications',
    'https://onesignal.com/api/v1/notifications',
    ...(isLocal ? ['/api/onesignal/notifications'] : [])
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const resData = await res.json();
        console.log('[OneSignal] Push sent successfully via endpoint:', endpoint, resData);
        return {
          success: true,
          data: resData,
          endpoint,
          payload
        };
      } else {
        const errorText = await res.text();
        lastError = `Status ${res.status}: ${errorText}`;
        console.warn(`[OneSignal] Endpoint ${endpoint} returned ${res.status}:`, errorText);
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`[OneSignal] Endpoint ${endpoint} network error:`, err.message);
    }
  }

  return {
    success: false,
    error: lastError || 'All endpoints failed to dispatch push.',
    payload
  };
}

/**
 * Triggers an instant test push to verify off-screen mobile phone delivery.
 */
export async function sendTestMobilePush(currentUser) {
  const adminIds = ['usr_general_admin', 'usr_662444', ...(currentUser?.id ? [currentUser.id] : [])];
  return sendOneSignalPush({
    targetUserId: currentUser?.id || 'usr_general_admin',
    targetUserIds: [...new Set(adminIds)],
    targetRoles: ['general_admin'],
    title: 'Al-Tawoos ERP | الطاووس',
    message: '✓ اختبار الإشعار: هاتفك متصل بالنظام ويستقبل التنبيهات بنجاح حتى لو الشاشة مقفلة!',
    url: '/#tab=fg_inward',
    docId: 'TEST-ALERT',
    actionType: 'test_notification'
  });
}
