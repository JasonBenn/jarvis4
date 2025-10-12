import { prisma } from '../db/client.js';

export interface BookData {
  user_book_id: number;
  title: string;
  author: string;
  readable_title: string;
  source: string;
  cover_image_url: string;
  unique_url: string | null;
  summary: string | null;
  book_tags: Array<{ id: number; name: string }>;
  category: string;
  document_note: string | null;
  readwise_url: string;
  source_url: string | null;
  asin: string | null;
}

export async function upsertBook(bookData: BookData) {
  return prisma.book.upsert({
    where: { id: bookData.user_book_id },
    update: {
      title: bookData.title,
      author: bookData.author,
      readableTitle: bookData.readable_title,
      source: bookData.source,
      coverImageUrl: bookData.cover_image_url,
      uniqueUrl: bookData.unique_url,
      summary: bookData.summary,
      bookTags: JSON.stringify(bookData.book_tags),
      category: bookData.category,
      documentNote: bookData.document_note,
      readwiseUrl: bookData.readwise_url,
      sourceUrl: bookData.source_url,
      asin: bookData.asin,
    },
    create: {
      id: bookData.user_book_id,
      title: bookData.title,
      author: bookData.author,
      readableTitle: bookData.readable_title,
      source: bookData.source,
      coverImageUrl: bookData.cover_image_url,
      uniqueUrl: bookData.unique_url,
      summary: bookData.summary,
      bookTags: JSON.stringify(bookData.book_tags),
      category: bookData.category,
      documentNote: bookData.document_note,
      readwiseUrl: bookData.readwise_url,
      sourceUrl: bookData.source_url,
      asin: bookData.asin,
    },
  });
}

export async function getBook(id: number) {
  return prisma.book.findUnique({
    where: { id },
    include: { highlights: true },
  });
}
