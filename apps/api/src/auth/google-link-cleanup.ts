import type { PrismaService } from '../prisma/prisma.service.js';

// better-auth refuses to link Google to an existing account whose email was
// never verified (`requireLocalEmailVerified`) — that is what produced
// `?error=account_not_linked` for sellers who signed up with a password but
// never clicked the verification link. We turn that check off so the owner of
// the Google account (who has just proven the email) isn't locked out, and in
// exchange discard the credentials an unverified account may carry: whoever set
// that password never proved they own the email, so keeping it would let them
// sign in to an account the real owner now uses.
//
// Runs from the `account.create.after` hook. better-auth links the Google
// account *before* flipping `emailVerified`, so an unverified local user is
// still unverified here. A user created by Google itself is already verified,
// and a verified local user keeps their password — both are no-ops.
export async function discardUnverifiedCredentials(
  prisma: Pick<PrismaService, 'user' | 'account' | 'session'>,
  account: { providerId: string; userId: string },
): Promise<void> {
  if (account.providerId !== 'google') return;

  const user = await prisma.user.findUnique({
    where: { id: account.userId },
    select: { emailVerified: true },
  });
  if (!user || user.emailVerified) return;

  await prisma.account.deleteMany({
    where: { userId: account.userId, providerId: 'credential' },
  });
  await prisma.session.deleteMany({ where: { userId: account.userId } });
}
