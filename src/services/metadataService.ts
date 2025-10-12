import { prisma } from '../db/client.js';

export async function getMetadata(key: string) {
  const metadata = await prisma.metadata.findUnique({
    where: { key },
  });
  return metadata?.value;
}

export async function setMetadata(key: string, value: string) {
  const now = new Date();
  return prisma.metadata.upsert({
    where: { key },
    update: {
      value,
      updatedAt: now,
    },
    create: {
      key,
      value,
      updatedAt: now,
    },
  });
}
