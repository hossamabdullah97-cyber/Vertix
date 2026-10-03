import { ForbiddenException } from '@nestjs/common';

/** What an unconfirmed account is told when it tries something that sends mail or money. */
export const UNVERIFIED_EMAIL =
  'Confirm your email address first: open the link we sent you, or send a new one from the notice at the top of the app.';

/**
 * Inviting people and paying are refused until the account has proved it
 * owns its email address. Until then anyone could sign up as someone else
 * and send invitations, in the platform's name, from an address they don't
 * hold, or put a workspace's billing under it.
 */
export async function assertEmailVerified(
  db: { user: { findUnique(args: { where: { id: string }; select: { emailVerified: true } }): Promise<{ emailVerified: Date | null } | null> } },
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) throw new ForbiddenException(UNVERIFIED_EMAIL);
}
