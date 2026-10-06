import { SetMetadata } from '@nestjs/common';
import type { PermissionArea } from '@vertex/shared';

export const AREA_KEY = 'permissionArea';

/**
 * The part of a workspace a controller's (or a route's) role-guarded routes
 * belong to, so a custom role can be given them. "roles" marks routes no
 * custom role ever reaches: changing who holds which role.
 */
export const Area = (area: PermissionArea | 'roles') => SetMetadata(AREA_KEY, area);
