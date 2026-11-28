/**
 * Corporate Branded Email Delivery Engine (SMTP via Nodemailer)
 * - Stores SMTP configuration strictly server-side in `system_private_config/smtp`
 *   (unmatched by firestore.rules -> client read/write strictly denied) or env vars.
 * - Rewrites Firebase Auth `oobCode` into our custom branded App URL:
 *   https://al-tawoos-erp.web.app/auth/action?mode=resetPassword&oobCode=...
 */

import nodemailer from "nodemailer";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const ALLOWED_ACTION_ORIGINS = new Set([
  "https://al-tawoos-erp.web.app",
  "https://al-tawoos-erp.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5173",
]);

export function resolveSafeActionOrigin(candidate = "") {
  const clean = String(candidate || "").trim().replace(/\/+$/, "");
  if (ALLOWED_ACTION_ORIGINS.has(clean)) return clean;
  return "https://al-tawoos-erp.web.app";
}

export function buildCustomResetActionUrl(firebaseGeneratedLink, origin = "") {
  const parsed = new URL(firebaseGeneratedLink);
  const oobCode = parsed.searchParams.get("oobCode") || "";
  if (!oobCode) {
    throw new Error("Generated Firebase reset link did not include an oobCode parameter.");
  }
  const baseOrigin = resolveSafeActionOrigin(origin);
  return `${baseOrigin}/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
}

export function escapeEmailHtml(raw = "") {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBrandedPasswordResetEmail({
  actionUrl,
  recipientName = "",
  email = "",
  isAr = true,
}) {
  const safeName = escapeEmailHtml(recipientName || email || "");
  const safeUrl = escapeEmailHtml(actionUrl);
  const subject = isAr
    ? "تعيين كلمة المرور — منظومة الطاووس ERP"
    : "Reset Your Password — Al-Tawoos ERP";

  const text = isAr
    ? `مرحباً ${recipientName || email}،\n\nتم طلب رابط لتعيين أو استعادة كلمة المرور الخاصة بحسابك في منظومة الطاووس ERP.\n\nاضغط على الرابط التالي:\n${actionUrl}\n\nإذا لم تطلب هذا الإجراء يمكنك تجاهل هذه الرسالة.`
    : `Hello ${recipientName || email},\n\nUse the secure link below to set or reset your password for Al-Tawoos ERP:\n\n${actionUrl}\n\nIf you did not request this, you can safely ignore this message.`;

  const html = `<!doctype html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:24px;background-color:#f4f7fb;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(2,42,99,0.08);">
    <tr>
      <td style="padding:22px 28px;background:linear-gradient(135deg,#062147 0%,#014EA8 100%);color:#ffffff;">
        <div style="font-size:18px;font-weight:800;letter-spacing:-0.2px;">منظومة الطاووس ERP | Al-Tawoos ERP</div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">${isAr ? "بوابة الدخول المعتمد وإدارة كلمة المرور" : "Corporate Identity & Access Portal"}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">
          ${isAr ? `مرحباً ${safeName}،` : `Hello ${safeName},`}
        </p>
        <p style="margin:0 0 22px;font-size:13.5px;line-height:1.7;color:#334155;">
          ${
            isAr
              ? "استخدم الزر التالي لتعيين كلمة مرور جديدة لحسابك المؤسسي في منظومة الطاووس ERP:"
              : "Click the button below to securely set or reset your corporate password for Al-Tawoos ERP:"
          }
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;background:linear-gradient(90deg,#014EA8 0%,#0D6CBA 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;border-radius:12px;">
            ${isAr ? "تعيين كلمة المرور الجديدة" : "Set New Password"}
          </a>
        </div>
        <div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:11px;color:#475569;word-break:break-all;">
          <div style="font-weight:700;margin-bottom:4px;">${isAr ? "أو انسخ الرابط مباشرة:" : "Or copy and paste this link:"}</div>
          <span dir="ltr" style="color:#014EA8;">${safeUrl}</span>
        </div>
        <p style="margin:20px 0 0;font-size:11px;color:#64748b;line-height:1.6;">
          ${
            isAr
              ? "هذا الرابط صالح لمرة واحدة فقط ومقيد بالحسابات النشطة بالمنظومة. إذا لم تطلب إعادة تعيين كلمة المرور يمكنك تجاهل هذا البريد بأمان."
              : "This single-use link is restricted to active ERP personnel accounts. If you did not request a password reset, you can safely ignore this email."
          }
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export async function resolveSmtpConfig(db) {
  let docData = null;
  try {
    const snap = await db.collection("system_private_config").doc("smtp").get();
    if (snap.exists) {
      docData = snap.data() || null;
    }
  } catch (err) {
    console.warn("[SMTP] Could not read server config doc:", err.message);
  }

  const host = String(docData?.host || process.env.SMTP_HOST || "").trim();
  const port = Number(docData?.port || process.env.SMTP_PORT || 465);
  const secure =
    typeof docData?.secure === "boolean"
      ? docData.secure
      : String(process.env.SMTP_SECURE || (port === 465 ? "true" : "false")).toLowerCase() === "true";
  const user = String(docData?.user || process.env.SMTP_USER || "").trim();
  const pass = String(docData?.pass || process.env.SMTP_PASS || "");
  const fromEmail = String(docData?.fromEmail || process.env.SMTP_FROM || user || "").trim();
  const fromName = String(docData?.fromName || process.env.SMTP_FROM_NAME || "Al-Tawoos ERP").trim();

  const configured = Boolean(host && port > 0 && user && pass && fromEmail);

  return {
    configured,
    source: docData?.host ? "firestore_private" : process.env.SMTP_HOST ? "env" : "none",
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    updatedAt: docData?.updatedAt || null,
  };
}

export function createNodemailerTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function assertGeneralAdmin(request) {
  const callerClaims = request.auth?.token || {};
  if (!request.auth?.uid || !callerClaims.erpActive || !callerClaims.isGeneralAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Only General Admin can inspect or configure corporate SMTP settings."
    );
  }
}

export const getSmtpConfigStatus = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 5,
  },
  async (request) => {
    assertGeneralAdmin(request);
    const db = getFirestore();
    const cfg = await resolveSmtpConfig(db);
    return {
      configured: cfg.configured,
      source: cfg.source,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      hasPassword: Boolean(cfg.pass),
    };
  }
);

export const saveSmtpConfig = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 5,
  },
  async (request) => {
    assertGeneralAdmin(request);
    const db = getFirestore();
    const existing = await resolveSmtpConfig(db);

    const host = String(request.data?.host || "").trim();
    const port = Number(request.data?.port || 465);
    const secure = Boolean(request.data?.secure ?? port === 465);
    const user = String(request.data?.user || "").trim();
    const incomingPass = String(request.data?.pass || "");
    const pass = incomingPass || existing.pass;
    const fromEmail = String(request.data?.fromEmail || user).trim();
    const fromName = String(request.data?.fromName || "Al-Tawoos ERP").trim();
    const verifyConnection = request.data?.verifyConnection !== false;

    if (!host || !user || !pass || !Number.isFinite(port) || port <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "SMTP host, port, username, and password are required."
      );
    }

    const candidateCfg = { host, port, secure, user, pass, fromEmail, fromName };
    if (verifyConnection) {
      try {
        const transporter = createNodemailerTransport(candidateCfg);
        await transporter.verify();
      } catch (err) {
        throw new HttpsError(
          "failed-precondition",
          `SMTP verification failed: ${err?.message || "Connection rejected"}`
        );
      }
    }

    await db
      .collection("system_private_config")
      .doc("smtp")
      .set(
        {
          host,
          port,
          secure,
          user,
          pass,
          fromEmail,
          fromName,
          updatedByUid: request.auth.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return {
      success: true,
      configured: true,
      host,
      port,
      secure,
      user,
      fromEmail,
      fromName,
      hasPassword: true,
    };
  }
);

export const sendTestSmtpEmail = onCall(
  {
    region: "me-central1",
    cors: true,
    maxInstances: 5,
  },
  async (request) => {
    assertGeneralAdmin(request);
    const db = getFirestore();
    const cfg = await resolveSmtpConfig(db);
    if (!cfg.configured) {
      throw new HttpsError(
        "failed-precondition",
        "SMTP settings are not configured yet. Save SMTP credentials first."
      );
    }

    const to = String(request.data?.to || request.auth.token?.email || "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      throw new HttpsError("invalid-argument", "Valid recipient email address is required.");
    }

    const transporter = createNodemailerTransport(cfg);
    const { subject, text, html } = buildBrandedPasswordResetEmail({
      actionUrl: "https://al-tawoos-erp.web.app/auth/action?mode=resetPassword&oobCode=SAMPLE_TEST",
      recipientName: request.auth.token?.name || to,
      email: to,
      isAr: Boolean(request.data?.isAr ?? true),
    });

    await transporter.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to,
      subject: `[TEST] ${subject}`,
      text,
      html,
    });

    return { success: true, to };
  }
);
