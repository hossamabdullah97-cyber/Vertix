/**
 * The granular permission scopes an API key or personal access token may hold
 * (sections 22–23). A credential can only do what its scopes allow, regardless
 * of the workspace role it acts under.
 */
export const SCOPES = [
  'cards:read',
  'cards:write',
  'crm:read',
  'crm:write',
  'analytics:read',
  'nfc:read',
  'qr:read',
  'integration:read',
  'integration:write',
] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_SET = new Set<string>(SCOPES);

/** True when `scope` is one of the known scopes. */
export function isValidScope(scope: string): boolean {
  return SCOPE_SET.has(scope);
}

/**
 * Whether a set of granted scopes satisfies a required one. A grant of `*`
 * means everything; a grant of `<resource>:*` (e.g. `crm:*`) covers every
 * action on that resource. Matching is otherwise exact.
 */
export function hasScope(granted: string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}

/** Whether the granted set satisfies every one of the required scopes. */
export function hasAllScopes(granted: string[], required: string[]): boolean {
  return required.every((r) => hasScope(granted, r));
}
