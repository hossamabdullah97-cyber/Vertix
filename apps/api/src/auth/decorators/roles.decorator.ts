import { SetMetadata } from '@nestjs/common';
import type { Role } from '@vertex/shared';

export const ROLES_KEY = 'roles';

/** Restricts a route to specific roles. Example: @Roles('OWNER', 'ADMIN') */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
