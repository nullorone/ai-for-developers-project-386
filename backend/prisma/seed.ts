import { PrismaClient } from '@prisma/client';

export const DEMO_CALENDAR_ID = '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  await prisma.calendar.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      id: DEMO_CALENDAR_ID,
      slug: 'demo',
      title: 'Консультация 30 минут',
      description: 'Короткий звонок для обсуждения задачи и следующих шагов.',
      ownerTimeZone: 'Europe/Amsterdam',
    },
  });
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
