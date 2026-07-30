import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting pipeline stages deduplication...');

  // 1. Fetch all pipeline stages ordered by createdAt
  const allStages = await prisma.pipelineStage.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  // Group stages by orgId and name
  const groups = new Map();
  for (const stage of allStages) {
    const key = `${stage.orgId}:${stage.name}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(stage);
  }

  // 2. Identify duplicate groups
  for (const [key, stages] of groups.entries()) {
    if (stages.length <= 1) continue;

    const [orgId, stageName] = key.split(':');
    console.log(`Found ${stages.length} stages for name "${stageName}" in org ${orgId}`);

    // The first one is the target we keep
    const targetStage = stages[0];
    const duplicates = stages.slice(1);
    const duplicateIds = duplicates.map((s) => s.id);

    console.log(`- Keeping stage ID: ${targetStage.id}`);
    console.log(`- Redundant stage IDs to remove: ${duplicateIds.join(', ')}`);

    // 3. Move leads referencing duplicate stages to the target stage
    const leadUpdateResult = await prisma.lead.updateMany({
      where: {
        stageId: { in: duplicateIds },
      },
      data: {
        stageId: targetStage.id,
      },
    });
    console.log(`- Updated ${leadUpdateResult.count} leads to use stage ID: ${targetStage.id}`);

    // 4. Update lead activities (stage changes) referencing duplicate stage IDs
    const activities = await prisma.leadActivity.findMany({
      where: {
        type: 'STAGE_CHANGE',
      },
    });

    let updatedActivitiesCount = 0;
    for (const activity of activities) {
      const metadata = activity.metadata;
      if (metadata && typeof metadata === 'object') {
        let changed = false;
        const newMetadata = { ...metadata };

        if (duplicateIds.includes(newMetadata.from)) {
          newMetadata.from = targetStage.id;
          changed = true;
        }
        if (duplicateIds.includes(newMetadata.to)) {
          newMetadata.to = targetStage.id;
          changed = true;
        }

        if (changed) {
          await prisma.leadActivity.update({
            where: { id: activity.id },
            data: { metadata: newMetadata },
          });
          updatedActivitiesCount++;
        }
      }
    }
    console.log(`- Updated ${updatedActivitiesCount} lead stage-change activities`);

    // 5. Delete the duplicate stages (hard delete from database)
    const deleteResult = await prisma.pipelineStage.deleteMany({
      where: {
        id: { in: duplicateIds },
      },
    });
    console.log(`- Deleted ${deleteResult.count} duplicate stage records`);
  }

  console.log('Deduplication complete.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
