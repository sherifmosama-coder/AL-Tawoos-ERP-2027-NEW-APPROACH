import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/**
 * Resolves all valid FCM device tokens for a given set of targetUserIds and targetRoles.
 * Returns an array of tokens and a map of { token: userId } for automatic cleanup of stale tokens.
 */
async function resolveRecipientTokens({ targetUserId, targetUserIds = [], targetRoles = [] }) {
  const userIdsToQuery = new Set(targetUserIds || []);
  if (targetUserId) userIdsToQuery.add(targetUserId);

  const tokenUserMap = new Map();

  // 1. Explicit targeted users
  if (userIdsToQuery.size > 0) {
    for (const uid of userIdsToQuery) {
      try {
        const uSnap = await db.collection("users").doc(uid).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          (uData.fcmTokens || []).forEach((token) => {
            if (token && typeof token === "string") {
              tokenUserMap.set(token, uid);
            }
          });
        }
      } catch (e) {
        console.error(`[Push] Error fetching user ${uid}:`, e);
      }
    }
  }

  // 2. Targeted user roles
  if (Array.isArray(targetRoles) && targetRoles.length > 0) {
    try {
      const rolesSnap = await db
        .collection("users")
        .where("role", "in", targetRoles.slice(0, 10))
        .get();

      rolesSnap.forEach((uDoc) => {
        const uData = uDoc.data();
        (uData.fcmTokens || []).forEach((token) => {
          if (token && typeof token === "string") {
            tokenUserMap.set(token, uDoc.id);
          }
        });
      });
    } catch (e) {
      console.error("[Push] Error fetching users by role:", e);
    }
  }

  return {
    tokens: Array.from(tokenUserMap.keys()),
    tokenUserMap,
  };
}

/**
 * Prunes expired or invalid registration tokens from user documents in Firestore.
 */
async function cleanupStaleTokens(staleTokens, tokenUserMap) {
  if (!staleTokens || staleTokens.length === 0) return;
  for (const token of staleTokens) {
    const userId = tokenUserMap.get(token);
    if (userId) {
      try {
        const userRef = db.collection("users").doc(userId);
        const uSnap = await userRef.get();
        if (uSnap.exists) {
          const currentTokens = uSnap.data()?.fcmTokens || [];
          const updated = currentTokens.filter((t) => t !== token);
          await userRef.update({ fcmTokens: updated });
          console.log(`[Push] Removed stale FCM token for user ${userId}`);
        }
      } catch (err) {
        console.error(`[Push] Error pruning token for user ${userId}:`, err);
      }
    }
  }
}

/**
 * Trigger: On creation of an Action Required entry in user_actions_queue.
 * Wakes the recipient's mobile phone even when locked/screen is off.
 */
export const onActionRequiredCreated = onDocumentCreated(
  {
    document: "user_actions_queue/{actionId}",
    region: "me-central2",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.status !== "pending") return;

    const { tokens, tokenUserMap } = await resolveRecipientTokens({
      targetUserId: data.targetUserId,
      targetUserIds: data.targetUserIds,
      targetRoles: data.targetRoles,
    });

    if (tokens.length === 0) {
      console.log(`[Push] No registered FCM tokens found for action ${event.params.actionId}`);
      return;
    }

    const title = data.title || "إجراء واعتماد مطلوب";
    const body = data.message || `مطلوب اعتماد مستند برقم: ${data.docNumber || data.docId}`;
    const targetUrl = data.targetTab
      ? `/#tab=${data.targetTab}${data.highlightId ? `&highlight=${data.highlightId}` : ""}`
      : "/";

    const messagePayload = {
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        url: targetUrl,
        targetTab: data.targetTab || "",
        targetModule: data.targetModule || "",
        docId: data.docId || "",
        actionType: data.actionType || "",
      },
      webpush: {
        notification: {
          title,
          body,
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          tag: `action_${data.docId || event.params.actionId}`,
          renotify: true,
          vibrate: [200, 100, 200, 100, 200],
          data: {
            url: targetUrl,
          },
        },
        fcmOptions: {
          link: targetUrl,
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(messagePayload);
      console.log(
        `[Push] Action ${event.params.actionId}: sent to ${tokens.length} devices (${response.successCount} ok, ${response.failureCount} failed).`
      );

      // Clean up stale or unregistered tokens
      if (response.failureCount > 0) {
        const staleTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              staleTokens.push(tokens[idx]);
            }
          }
        });
        await cleanupStaleTokens(staleTokens, tokenUserMap);
      }
    } catch (err) {
      console.error("[Push] Multicast send error for action:", err);
    }
  }
);

/**
 * Trigger: On creation of an informational notification in system_notifications.
 * Wakes the recipient's mobile phone even when locked/screen is off.
 */
export const onSystemNotificationCreated = onDocumentCreated(
  {
    document: "system_notifications/{notifId}",
    region: "me-central2",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { tokens, tokenUserMap } = await resolveRecipientTokens({
      targetUserId: data.targetUserId,
      targetRoles: data.targetRoles,
    });

    if (tokens.length === 0) return;

    const title = data.title || "إشعار جديد في النظام";
    const body = data.message || "";
    const targetUrl = data.targetTab
      ? `/#tab=${data.targetTab}${data.highlightId ? `&highlight=${data.highlightId}` : ""}`
      : "/";

    const messagePayload = {
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        url: targetUrl,
        targetTab: data.targetTab || "",
        targetModule: data.targetModule || "",
      },
      webpush: {
        notification: {
          title,
          body,
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          tag: `notif_${event.params.notifId}`,
          renotify: true,
          vibrate: [150, 100, 150],
          data: {
            url: targetUrl,
          },
        },
        fcmOptions: {
          link: targetUrl,
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(messagePayload);
      console.log(
        `[Push] Notification ${event.params.notifId}: sent to ${tokens.length} devices (${response.successCount} ok).`
      );

      if (response.failureCount > 0) {
        const staleTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              staleTokens.push(tokens[idx]);
            }
          }
        });
        await cleanupStaleTokens(staleTokens, tokenUserMap);
      }
    } catch (err) {
      console.error("[Push] Multicast send error for notification:", err);
    }
  }
);
