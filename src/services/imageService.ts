import { prisma } from '../db/client.js';

export async function getImageByHash(entryHash: string) {
  return prisma.generatedImage.findUnique({
    where: { entryHash },
  });
}

export async function createImage(entryHash: string, imageUrl: string) {
  return prisma.generatedImage.create({
    data: {
      entryHash,
      imageUrl,
    },
  });
}

export async function updateImageDocument(entryHash: string, documentId: string) {
  return prisma.generatedImage.update({
    where: { entryHash },
    data: { documentId },
  });
}
