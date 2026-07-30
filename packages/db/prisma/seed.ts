import bcrypt from 'bcryptjs';
import { prisma } from '../src/index';

/**
 * Development seed: demo organization + owner + 7 sales stages + scoring rules.
 * Idempotent via upsert.
 */
async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@vertex.dev' },
    update: {
      isSuperAdmin: true,
    },
    create: {
      email: 'owner@vertex.dev',
      name: 'Demo Owner',
      passwordHash,
      emailVerified: new Date(),
      isSuperAdmin: true,
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
      plan: 'PRO',
    },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: owner.id, orgId: org.id } },
    update: { role: 'OWNER' },
    create: { userId: owner.id, orgId: org.id, role: 'OWNER' },
  });

  const stages = [
    'New',
    'Contacted',
    'Qualified',
    'Proposal',
    'Negotiation',
    'Won',
    'Lost',
  ];
  for (let i = 0; i < stages.length; i++) {
    const existing = await prisma.pipelineStage.findFirst({
      where: { orgId: org.id, name: stages[i] },
    });
    if (!existing) {
      await prisma.pipelineStage.create({
        data: { orgId: org.id, name: stages[i], order: i },
      });
    }
  }

  const rules: Array<{ eventType: string; points: number }> = [
    { eventType: 'VIEW', points: 1 },
    { eventType: 'CLICK', points: 3 },
    { eventType: 'SHARE', points: 5 },
    { eventType: 'NFC_SCAN', points: 8 },
    { eventType: 'SAVE', points: 10 },
  ];
  for (const r of rules) {
    const existing = await prisma.scoringRule.findFirst({
      where: { orgId: org.id, eventType: r.eventType },
    });
    if (!existing) {
      await prisma.scoringRule.create({
        data: { orgId: org.id, eventType: r.eventType, points: r.points },
      });
    }
  }

  console.log('Seed complete:', { org: org.slug, owner: owner.email });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
