#!/usr/bin/env tsx

import { prisma } from '../src/db/client.js';

async function main() {
  const highlights = await prisma.highlight.findMany({
    take: 3,
    where: { url: { not: null } }
  });

  console.log(JSON.stringify(highlights.map(h => ({
    id: h.id,
    url: h.url,
    readwiseUrl: h.readwiseUrl
  })), null, 2));
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
