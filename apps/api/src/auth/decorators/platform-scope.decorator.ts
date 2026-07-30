import { SetMetadata } from '@nestjs/common';

export const PLATFORM_SCOPE_KEY = 'platformScope';

/**
 * Opts a route out of tenant isolation so it can read across every
 * organization — the platform admin console, and nothing else.
 *
 * This must always be deliberate. TenantGuard grants the cross-org scope only
 * when a route carries this marker AND the caller is a super admin; it is never
 * reached by falling through some other branch. Applying it to a route that
 * serves normal users would expose every tenant's rows at once.
 */
export const PlatformScope = () => SetMetadata(PLATFORM_SCOPE_KEY, true);
