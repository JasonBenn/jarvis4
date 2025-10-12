#!/usr/bin/env tsx

import { prisma } from '../src/db/client.js';

async function main() {
  const result = await prisma.highlight.updateMany({
    where: { status: 'INTEGRATED' },
    data: { status: 'NEW' }
  });

  console.log(`Updated ${result.count} highlights from INTEGRATED to NEW`);
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
