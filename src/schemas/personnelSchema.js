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
