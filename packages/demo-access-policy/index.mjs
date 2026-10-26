// ADS reusable demo-access decision layer.
// PRODUCT BACKEND ONLY: identity and approval must be verified through trusted
// server-side adapters. This module never verifies a JWT or accepts browser claims.
import { readFileSync } from 'node:fs';
const source = new URL('../../config/demo-access-policy.v1.json', import.meta.url);
export const policy = Object.freeze(JSON.parse(readFileSync(source, 'utf8')));
const deny = reason => ({ allowed: false, reason });
const allow = rule => ({ allowed: true, reason: 'APPROVED', ruleId: rule.id });
const hasText = x => typeof x === 'string' && x.trim().length > 0;

export function validatePolicy(doc, clients) {
  if (!doc || doc.schemaVersion !== 1 || doc.defaultEffect !== 'deny' || !Array.isArray(doc.rules)) throw Error('Invalid demo-access policy');
  if (!clients || !Array.isArray(clients.products)) throw Error('Client registry missing');
  const clientsById = new Map(clients.products.map(p => [p.client_id,p]));
  const known = new Set();
  const audiences = new Set(['public','registered_demo','qualified_business','institutional_partner','ads_staff','ads_engineer']);
  for (const rule of doc.rules) {
    if (!hasText(rule.id) || known.has(rule.id) || !audiences.has(rule.audience)) throw Error('Bad or duplicate demo rule');
    known.add(rule.id);
    if (!Array.isArray(rule.roles)) throw Error(rule.id + ': roles missing');
    if (rule.audience === 'public') {
      if (rule.clientId !== null || rule.roles.length || rule.approvalRequired !== false) throw Error(rule.id + ': public may not inherit a product identity');
      continue;
    }
    const client = clientsById.get(rule.clientId);
    if (!client || rule.roles.length < 1) throw Error(rule.id + ': unknown product or no roles');
    const valid = new Set([
      ...(client.self_service_roles || []),
      ...(client.assignable_roles || []),
      ...(client.ads_only_roles || []),
      ...(client.demo_orgs || []).flatMap(org=>org.roles || [])
    ]);
    for (const role of rule.roles) if (!valid.has(role)) throw Error(rule.id + ': unregistered role ' + role);
    if (!rule.approvalRequired && !['registered_demo'].includes(rule.audience)) throw Error(rule.id + ': privileged audience needs approval');
    if (rule.audience === 'ads_staff' && !rule.staffTenantRequired) throw Error(rule.id + ': staff tenant not required');
  }
  return true;
}

// The caller must supply identity resolved from a verified kit-issued JWT AND
// a live server-side tenant/membership lookup; never pass request body claims.
// approval is obtained from a restricted ADS operator grant database.
export function evaluateDemoAccess({ action, identity = null, approval = null, environment = 'unknown', now = Date.now() } = {}) {
  const rule = policy.rules.find(x => x.id === action);
  if (!rule) return deny('RULE_NOT_REGISTERED');
  if (rule.releaseDisabled) return deny('RELEASE_NOT_APPROVED');
  if (rule.audience === 'public') return allow(rule);
  if (environment !== 'demo') return deny('NOT_ISOLATED_DEMO_ENVIRONMENT');
  if (!identity || identity.verifiedByServer !== true || identity.membershipVerifiedByServer !== true) return deny('UNVERIFIED_IDENTITY_OR_MEMBERSHIP');
  if (!hasText(identity.sub) || !hasText(identity.tenantId) || identity.productId !== rule.clientId) return deny('PRODUCT_OR_TENANT_MISMATCH');
  if (!Array.isArray(identity.roles) || !rule.roles.some(r => identity.roles.includes(r))) return deny('ROLE_NOT_GRANTED');
  if (rule.staffTenantRequired && identity.staffTenantVerifiedByServer !== true) return deny('STAFF_TENANT_REQUIRED');
  if (!rule.approvalRequired) return allow(rule);
  if (!approval || approval.verifiedByServer !== true || approval.revoked === true) return deny('QUALIFIED_APPROVAL_REQUIRED');
  if (!hasText(approval.id) || !hasText(approval.approvedBy) || approval.approvedBy === identity.sub) return deny('INDEPENDENT_APPROVER_REQUIRED');
  if (approval.sub !== identity.sub || approval.productId !== identity.productId || approval.tenantId !== identity.tenantId || approval.action !== action) return deny('APPROVAL_SCOPE_MISMATCH');
  const instant = Number(now), from = Date.parse(approval.validFrom), until = Date.parse(approval.expiresAt);
  if (!Number.isFinite(instant) || !Number.isFinite(from) || !Number.isFinite(until) || from > instant || until <= instant || until <= from) return deny('APPROVAL_NOT_CURRENT');
  return allow(rule);
}
