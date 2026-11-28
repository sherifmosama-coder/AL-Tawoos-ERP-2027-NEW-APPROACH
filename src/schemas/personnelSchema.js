/**
 * Canonical Zod Schemas & Dual-Email Normalization for Personnel & System Accounts.
 * Allows each ERP user to link 1 or 2 email addresses (e.g., personal Gmail + custom company domain).
 */
import { z } from 'zod';

const emailFormatSchema = z.string().trim().toLowerCase().email();

/**
 * Normalizes and deduplicates 1 or 2 login emails for an ERP user/employee.
 */
export function normalizeUserEmails({ email = '', secondaryEmail = '', loginEmails = [] } = {}) {
  const candidates = [
    email,
    secondaryEmail,
    ...(Array.isArray(loginEmails) ? loginEmails : []),
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);

  const unique = Array.from(new Set(candidates)).slice(0, 2);
  unique.forEach((addr) => {
    const parsed = emailFormatSchema.safeParse(addr);
    if (!parsed.success) {
      throw new Error(`Invalid login email address: "${addr}"`);
    }
  });

  return {
    primaryEmail: unique[0] || '',
    secondaryEmail: unique[1] || '',
    loginEmails: unique,
  };
}

const GOOGLE_CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Returns true if the address uses a standard personal Google account domain.
 * Custom company domains (e.g. user@altawoos.com) return false so Admin forms can auto-offer
 * initial password provisioning.
 */
export function isGoogleEmailAddress(rawEmail = '') {
  const clean = String(rawEmail || '').trim().toLowerCase();
  const atIdx = clean.lastIndexOf('@');
  if (atIdx < 1) return false;
  const domain = clean.slice(atIdx + 1);
  return GOOGLE_CONSUMER_DOMAINS.has(domain);
}

/**
 * Returns normalized valid email addresses from a user/employee record that are non-Google.
 */
export function detectNonGoogleEmails({ email = '', secondaryEmail = '', loginEmails = [] } = {}) {
  const rawList = [
    email,
    secondaryEmail,
    ...(Array.isArray(loginEmails) ? loginEmails : []),
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(rawList))
    .filter((addr) => emailFormatSchema.safeParse(addr).success && !isGoogleEmailAddress(addr))
    .slice(0, 2);
}

/**
 * Picks the best target email for Email/Password provisioning (preferring custom company domains).
 */
export function getDefaultPasswordProvisionEmail({ email = '', secondaryEmail = '', loginEmails = [] } = {}) {
  const nonGoogle = detectNonGoogleEmails({ email, secondaryEmail, loginEmails });
  if (nonGoogle.length > 0) return nonGoogle[0];

  const allValid = [secondaryEmail, email, ...(Array.isArray(loginEmails) ? loginEmails : [])]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((addr) => emailFormatSchema.safeParse(addr).success);
  return allValid[0] || '';
}

/**
 * Matches an active ERP user against primary email, secondaryEmail, or loginEmails[].
 */
export function findUserByLoginEmail(users = [], rawEmail = '') {
  const target = String(rawEmail || '').trim().toLowerCase();
  if (!target || !Array.isArray(users)) return null;

  return (
    users.find((u) => {
      if (!u) return false;
      if (u.status === 'inactive' || u.isActive === false || u.disabled === true) return false;
      const list = [
        u.email,
        u.secondaryEmail,
        ...(Array.isArray(u.loginEmails) ? u.loginEmails : []),
      ]
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean);
      return list.includes(target);
    }) || null
  );
}

/**
 * Checks if any email in candidateEmails is already owned by another active/existing user.
 */
export function findEmailConflictUser(users = [], candidateEmails = [], excludeUserId = '', excludeEmpId = '') {
  const normalizedCandidates = (Array.isArray(candidateEmails) ? candidateEmails : [])
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
  if (normalizedCandidates.length === 0 || !Array.isArray(users)) return null;

  return (
    users.find((u) => {
      if (!u) return false;
      if (excludeUserId && u.id === excludeUserId) return false;
      if (excludeEmpId && u.employeeId === excludeEmpId) return false;
      const existing = [
        u.email,
        u.secondaryEmail,
        ...(Array.isArray(u.loginEmails) ? u.loginEmails : []),
      ]
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean);
      return normalizedCandidates.some((c) => existing.includes(c));
    }) || null
  );
}

export const userAccountSchema = z
  .object({
    id: z.string().min(1),
    nameAr: z.string().min(1),
    name: z.string().optional(),
    email: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
    secondaryEmail: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
    loginEmails: z.array(z.string().trim().toLowerCase().email()).max(2).optional(),
    departmentIds: z.array(z.string()).optional(),
    role: z.enum(['general_admin', 'admin', 'standard']).default('standard'),
    isGeneralAdmin: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough();

export const employeeRecordSchema = z
  .object({
    id: z.string().min(1),
    employeeCode: z.string().min(1),
    nameAr: z.string().min(1),
    nameEn: z.string().optional(),
    email: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
    secondaryEmail: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
    loginEmails: z.array(z.string().trim().toLowerCase().email()).max(2).optional(),
    departmentIds: z.array(z.string()).default([]),
    operationalTags: z.array(z.string()).default([]),
    isSystemUser: z.boolean().default(false),
    linkedUserId: z.string().nullable().optional(),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .passthrough();
