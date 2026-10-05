import { SetMetadata } from '@nestjs/common';

export const PERSON_ROUTE_KEY = 'personRoute';

/**
 * About the signed-in person rather than a workspace: their workspaces and
 * invitations, their account, their notifications. A workspace they are no
 * longer in (removed while signed in, still named by their session or the
 * page) leaves these working without one, instead of shutting them out of
 * the very routes that let them carry on. Never on a route that reads or
 * writes workspace data: without a tenant nothing would scope it.
 */
export const PersonRoute = () => SetMetadata(PERSON_ROUTE_KEY, true);
