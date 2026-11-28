/**
 * Shared Zod Schema Contracts Barrel & Safe Runtime Validator.
 */

export * from './personnelSchema.js';
export * from './financeSchema.js';
export * from './inventorySchema.js';
export * from './salesDispatchSchema.js';

/**
 * Validates any ERP payload against a Zod schema.
 * When `strict: true`, throws an Error detailing invalid field paths.
 */
export function validateErpPayload(schema, payload, { label = 'ERP Payload', strict = false } = {}) {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { valid: true, data: result.data, issues: [] };
  }

  const issues = (result.error?.issues || []).map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join('.') : '',
    message: issue.message,
  }));

  if (strict) {
    const details = issues.map((i) => `${i.path || 'root'}: ${i.message}`).join('; ');
    throw new Error(`Invalid ${label}: ${details}`);
  }

  return { valid: false, data: payload, issues };
}
