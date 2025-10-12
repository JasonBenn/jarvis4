import { prisma } from '../db/client.js';

export interface HighlightData {
  id: number;
  text: string;
  location: number | null;
  location_type: string;
  note: string | null;
  color: string | null;
  highlighted_at: string;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  end_location: number | null;
  url: string | null;
  tags: Array<{ id: number; name: string }>;
  is_favorite?: boolean;
  is_discard?: boolean;
  readwise_url?: string;
  book_id: number;
}

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
    include: {
      book: true,
    },
  });
}

export async function upsertHighlight(highlightData: HighlightData) {
  const id = String(highlightData.id);
  const existing = await prisma.highlight.findUnique({ where: { id } });

  const data = {
    text: highlightData.text,
    location: highlightData.location,
    locationType: highlightData.location_type,
    note: highlightData.note,
    color: highlightData.color,
    highlightedAt: highlightData.highlighted_at,
    createdAt: highlightData.created_at,
    updatedAt: highlightData.updated_at,
    externalId: highlightData.external_id,
    endLocation: highlightData.end_location,
    url: highlightData.url,
    tags: JSON.stringify(highlightData.tags),
    isFavorite: highlightData.is_favorite,
    isDiscard: highlightData.is_discard,
    readwiseUrl: highlightData.readwise_url,
    bookId: highlightData.book_id,
    // Only set these on creation
    ...(!existing && {
      firstSeen: new Date(),
      lastUpdated: new Date(),
    }),
  };

  return prisma.highlight.upsert({
    where: { id },
    update: data,
    create: {
      id,
      ...data,
      status: 'NEW',
    },
  });
}

export async function getHighlight(id: string) {
  return prisma.highlight.findUnique({
    where: { id },
  });
}

export async function getHighlightWithBook(id: string) {
  return prisma.highlight.findUnique({
    where: { id },
    include: {
      book: true,
    },
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
