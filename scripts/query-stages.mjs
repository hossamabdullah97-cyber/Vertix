import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stages = await prisma.pipelineStage.findMany({
    orderBy: { order: 'asc' },
  });
  console.log('--- Pipeline Stages in Database ---');
  console.log(JSON.stringify(stages, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
