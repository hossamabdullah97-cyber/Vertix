import { SetMetadata } from '@nestjs/common';
import type { Scope } from './scopes';

export const SCOPES_KEY = 'requiredScopes';

/**
 * Declares the scopes an API key / personal access token must hold to call a
 * route. Human (JWT) callers are unaffected — they are governed by @Roles.
 * Example: @RequireScopes('crm:read')
 */
export const RequireScopes = (...scopes: Scope[]) => SetMetadata(SCOPES_KEY, scopes);
