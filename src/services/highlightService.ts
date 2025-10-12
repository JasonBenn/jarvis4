import { prisma } from '../db/client.js';

export async function getVisibleHighlights() {
  const now = new Date();
  return prisma.highlight.findMany({
    where: {
      status: 'NEW',
      OR: [
        { nextShowDate: null },
        { nextShowDate: { lte: now } },
      ],
    },
  });
}

export async function getHighlight(id: string) {
  return prisma.highlight.findUnique({
    where: { id },
  });
}

export async function trackHighlight(id: string) {
  const existing = await prisma.highlight.findUnique({ where: { id } });

  if (existing) {
    return existing;
  }

  const now = new Date();
  return prisma.highlight.create({
    data: {
      id,
      status: 'NEW',
      firstSeen: now,
      lastUpdated: now,
    },
  });
}

export async function updateHighlightStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED') {
  const now = new Date();
  return prisma.highlight.update({
    where: { id },
    data: {
      status,
      lastUpdated: now,
    },
  });
}

export async function snoozeHighlight(id: string, durationWeeks: number) {
  const highlight = await prisma.highlight.findUnique({ where: { id } });

  if (!highlight) {
    throw new Error('Highlight not found');
  }

  const now = new Date();
  const nextShowDate = new Date(now.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000);

  const snoozeHistory = highlight.snoozeHistory
    ? JSON.parse(highlight.snoozeHistory)
    : [];
  snoozeHistory.push(now.toISOString());

  return prisma.highlight.update({
    where: { id },
    data: {
      snoozeHistory: JSON.stringify(snoozeHistory),
      nextShowDate,
      lastUpdated: now,
    },
  });
}
