/**
 * Server-Side Authentication Allowlist & Custom Claims Synchronization Engine
 * - Enforces strict allowlisting across 1 or 2 linked emails per active ERP user
 * - Mints minimal Custom Claims (`erpActive`, `erpUserId`, `role`, `isGeneralAdmin`, `allowDevPersonaSwitch`, `departmentIds`)
 * - Keeps Custom Claims synchronized live whenever `users/{userId}` changes
 * - Allows General Admin to provision Email/Password logins for non-Google company domains
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  resolveSmtpConfig,
  createNodemailerTransport,
  buildCustomResetActionUrl,
  buildBrandedPasswordResetEmail,
  resolveSafeActionOrigin,
} from "./brandedMailer.js";

export function normalizeEmailAddr(raw = "") {
  return String(raw || "").trim().toLowerCase();
}

export function extractUserLoginEmails(user = {}) {
  const raw = [
    user.email,
    user.secondaryEmail,
    ...(Array.isArray(user.loginEmails) ? user.loginEmails : []),
  ];
  return Array.from(
    new Set(raw.map((v) => normalizeEmailAddr(v)).filter(Boolean))
  ).slice(0, 2);
}

export function isUserRecordActive(user = {}) {
  if (!user) return false;
  if (user.status === "inactive") return false;
  if (user.isActive === false) return false;
  if (user.disabled === true) return false;
  return true;
}

export function buildErpCustomClaims(erpUser = {}) {
  const isGeneralAdmin = Boolean(
    erpUser.isGeneralAdmin ||
      erpUser.role === "general_admin" ||
      erpUser.role === "admin"
  );
  const deptIds = Array.from(
    new Set(
      [
        ...(Array.isArray(erpUser.departmentIds) ? erpUser.departmentIds : []),
        erpUser.departmentId,
      ].filter(Boolean)
    )
  ).slice(0, 10);

  return {
    erpActive: true,
    erpUserId: String(erpUser.id),
    role: isGeneralAdmin ? "general_admin" : "standard",
    isGeneralAdmin,
    allowDevPersonaSwitch: isGeneralAdmin,
    departmentIds: deptIds,
  };
}

const REVOKED_ERP_CLAIMS = {
  erpActive: false,
  erpUserId: "",
  role: "none",
  isGeneralAdmin: false,
  allowDevPersonaSwitch: false,
  departmentIds: [],
};

async function findActiveErpUserByEmail(db, email) {
  const target = normalizeEmailAddr(email);
  if (!target) return null;

  const snap = await db.collection("users").get();
  let matched = null;
  snap.forEach((docSnap) => {
    if (matched) return;
    const data = { id: docSnap.id, ...docSnap.data() };
    if (!isUserRecordActive(data)) return;
    const emails = extractUserLoginEmails(data);
    if (emails.includes(target)) {
      matched = data;
    }
  });
  return matched;
}

export const claimUserClaimsOnLogin = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const uid = request.auth.uid;
    const email = normalizeEmailAddr(request.auth.token?.email);
    const provider = request.auth.token?.firebase?.sign_in_provider || "";
    const emailVerified = Boolean(request.auth.token?.email_verified);

    if (!email) {
      throw new HttpsError("invalid-argument", "Signed-in account has no email address.");
    }

    // Google accounts must have verified emails; password accounts are provisioned by Admin
    if (provider !== "password" && provider !== "custom" && !emailVerified) {
      throw new HttpsError("permission-denied", "Email address is not verified.");
    }

    const db = getFirestore();
    const auth = getAuth();
    const erpUser = await findActiveErpUserByEmail(db, email);

    if (!erpUser) {
      await auth.setCustomUserClaims(uid, REVOKED_ERP_CLAIMS);
      throw new HttpsError(
        "permission-denied",
        `Access denied: "${email}" is not linked to any active ERP user.`
      );
    }

    const claims = buildErpCustomClaims(erpUser);
    await auth.setCustomUserClaims(uid, claims);

    await db
      .collection("users")
      .doc(erpUser.id)
      .set(
        {
          firebaseAuthUids: FieldValue.arrayUnion(uid),
          lastAuthUid: uid,
          lastLoginEmail: email,
          lastLoginAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return {
      authorized: true,
      erpUserId: erpUser.id,
      claims,
      userSummary: {
        id: erpUser.id,
        name: erpUser.name || erpUser.nameAr || "",
        nameAr: erpUser.nameAr || erpUser.name || "",
        role: claims.role,
        isGeneralAdmin: claims.isGeneralAdmin,
      },
    };
  }
);

/**
 * Explicit Admin-triggered callable to synchronize Firebase Auth Custom Claims
 * immediately after creating, updating, disabling, or deleting an ERP user.
 * Deployed in me-central1 alongside login/provisioning callables (because me-central2
 * Eventarc triggers require CNTXT / invoiced billing).
 */
export const syncErpUserClaims = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 10,
  },
  async (request) => {
    const callerClaims = request.auth?.token || {};
    if (!request.auth?.uid || !callerClaims.erpActive || !callerClaims.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only General Admin can synchronize user authentication claims."
      );
    }

    const userId = String(request.data?.userId || "").trim();
    if (!userId) {
      throw new HttpsError("invalid-argument", "userId is required.");
    }

    const extraEmails = Array.isArray(request.data?.extraEmails)
      ? request.data.extraEmails.map((e) => normalizeEmailAddr(e)).filter(Boolean)
      : [];

    const db = getFirestore();
    const auth = getAuth();
    const userSnap = await db.collection("users").doc(userId).get();
    const afterData = userSnap.exists ? { id: userSnap.id, ...userSnap.data() } : null;

    const targetUids = new Set();
    if (afterData) {
      if (Array.isArray(afterData.firebaseAuthUids)) {
        afterData.firebaseAuthUids.filter(Boolean).forEach((u) => targetUids.add(u));
      }
      if (afterData.lastAuthUid) targetUids.add(afterData.lastAuthUid);
    }

    const emailsToResolve = Array.from(
      new Set([...extraEmails, ...(afterData ? extractUserLoginEmails(afterData) : [])])
    );

    for (const emailAddr of emailsToResolve) {
      try {
        const authUser = await auth.getUserByEmail(emailAddr);
        if (authUser?.uid) targetUids.add(authUser.uid);
      } catch {
        // User has not signed in or been created in Firebase Auth yet
      }
    }

    if (targetUids.size === 0) {
      return { syncedCount: 0, active: Boolean(afterData && isUserRecordActive(afterData)) };
    }

    const activeAfter = Boolean(afterData && isUserRecordActive(afterData));
    const claimsToApply = activeAfter
      ? buildErpCustomClaims(afterData)
      : REVOKED_ERP_CLAIMS;

    let syncedCount = 0;
    await Promise.all(
      Array.from(targetUids).map(async (uid) => {
        try {
          await auth.setCustomUserClaims(uid, claimsToApply);
          if (!activeAfter) {
            await auth.revokeRefreshTokens(uid);
          }
          syncedCount += 1;
        } catch (err) {
          console.warn(`[AuthSync] Unable to update claims for UID ${uid}:`, err.message);
        }
      })
    );

    return { syncedCount, active: activeAfter };
  }
);

export const createEmployeeAuthAccount = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 5,
  },
  async (request) => {
    const callerClaims = request.auth?.token || {};
    if (!request.auth?.uid || !callerClaims.erpActive || !callerClaims.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only General Admin can provision Email/Password login credentials."
      );
    }

    const email = normalizeEmailAddr(request.data?.email);
    const password = String(request.data?.password || "");
    const userId = String(request.data?.userId || "").trim();

    if (!email || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "Valid email address is required.");
    }
    if (password.length < 6) {
      throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
    }

    const db = getFirestore();
    const auth = getAuth();

    let erpUser = null;
    if (userId) {
      const uSnap = await db.collection("users").doc(userId).get();
      if (uSnap.exists) erpUser = { id: uSnap.id, ...uSnap.data() };
    }
    if (!erpUser) {
      erpUser = await findActiveErpUserByEmail(db, email);
    }

    if (!erpUser || !isUserRecordActive(erpUser)) {
      throw new HttpsError("failed-precondition", "Target user must exist and be active in ERP Users.");
    }

    const linkedEmails = extractUserLoginEmails(erpUser);
    if (!linkedEmails.includes(email)) {
      throw new HttpsError(
        "failed-precondition",
        `Email "${email}" is not linked to user ${erpUser.id}. Save it on the employee record first.`
      );
    }

    let authRecord;
    try {
      authRecord = await auth.getUserByEmail(email);
      authRecord = await auth.updateUser(authRecord.uid, {
        password,
        emailVerified: true,
        disabled: false,
        displayName: erpUser.nameAr || erpUser.name || email,
      });
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        authRecord = await auth.createUser({
          email,
          password,
          emailVerified: true,
          disabled: false,
          displayName: erpUser.nameAr || erpUser.name || email,
        });
      } else {
        throw err;
      }
    }

    const claims = buildErpCustomClaims(erpUser);
    await auth.setCustomUserClaims(authRecord.uid, claims);
    await db
      .collection("users")
      .doc(erpUser.id)
      .set(
        {
          firebaseAuthUids: FieldValue.arrayUnion(authRecord.uid),
        },
        { merge: true }
      );

    return {
      success: true,
      uid: authRecord.uid,
      email,
      erpUserId: erpUser.id,
    };
  }
);

/**
 * Ensures an active allowlisted ERP email has a backing Firebase Auth user, and if
 * Corporate SMTP is configured in `system_private_config/smtp`, sends a branded
 * Password Reset email pointing directly to our custom `/auth/action` UI.
 * Otherwise falls back cleanly so the client triggers Firebase's default reset email.
 * Returns neutral response for non-allowlisted emails to prevent enumeration.
 */
export const prepareErpPasswordReset = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 10,
  },
  async (request) => {
    const email = normalizeEmailAddr(request.data?.email);
    const isAr = request.data?.isAr !== false;
    const origin = resolveSafeActionOrigin(request.data?.origin || "");

    if (!email || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "Valid email address is required.");
    }

    const db = getFirestore();
    const auth = getAuth();
    const erpUser = await findActiveErpUserByEmail(db, email);
    if (!erpUser) {
      return { ok: true, delivery: "silent" };
    }

    try {
      await auth.getUserByEmail(email);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        const created = await auth.createUser({
          email,
          emailVerified: true,
          disabled: false,
          displayName: erpUser.nameAr || erpUser.name || email,
        });
        const claims = buildErpCustomClaims(erpUser);
        await auth.setCustomUserClaims(created.uid, claims);
        await db
          .collection("users")
          .doc(erpUser.id)
          .set(
            {
              firebaseAuthUids: FieldValue.arrayUnion(created.uid),
            },
            { merge: true }
          );
      } else {
        throw err;
      }
    }

    const smtpCfg = await resolveSmtpConfig(db);
    if (smtpCfg.configured) {
      const firebaseLink = await auth.generatePasswordResetLink(email, {
        url: origin,
      });
      const brandedUrl = buildCustomResetActionUrl(firebaseLink, origin);
      const recipientName = erpUser.nameAr || erpUser.name || email;
      const { subject, text, html } = buildBrandedPasswordResetEmail({
        actionUrl: brandedUrl,
        recipientName,
        email,
        isAr,
      });

      const transporter = createNodemailerTransport(smtpCfg);
      await transporter.sendMail({
        from: `"${smtpCfg.fromName}" <${smtpCfg.fromEmail}>`,
        to: email,
        subject,
        text,
        html,
      });

      return { ok: true, delivery: "corporate_smtp" };
    }

    return { ok: true, delivery: "firebase_default_fallback" };
  }
);
