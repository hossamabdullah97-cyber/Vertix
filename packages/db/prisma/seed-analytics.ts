import { prisma } from '../src/index';

/** Backfills ~14 days of demo analytics so the Command Center charts look alive. */
async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'demo' } });
  if (!org) throw new Error('demo org not found');
  const card = await prisma.card.findFirst({
    where: { orgId: org.id, slug: 'demo-card' },
  });
  if (!card) throw new Error('demo-card not found');

  const now = Date.now();
  let total = 0;
  for (let d = 13; d >= 0; d--) {
    const dayStart = new Date(now - d * 86_400_000);
    const trend = 13 - d;
    const views = 24 + Math.round(Math.sin(d / 2) * 8) + trend;
    const taps = 6 + Math.round(Math.cos(d / 2) * 4) + Math.round(trend / 2);
    const rows: Array<{ orgId: string; cardId: string; type: 'VIEW' | 'NFC_SCAN'; createdAt: Date }> = [];
    for (let i = 0; i < views; i++)
      rows.push({ orgId: org.id, cardId: card.id, type: 'VIEW', createdAt: new Date(dayStart.getTime() + i * 60_000) });
    for (let i = 0; i < taps; i++)
      rows.push({ orgId: org.id, cardId: card.id, type: 'NFC_SCAN', createdAt: new Date(dayStart.getTime() + i * 120_000) });
    await prisma.event.createMany({ data: rows });
    total += rows.length;
  }
  console.log(`Seeded ${total} analytics events over 14 days.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
