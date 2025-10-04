import { readFileSync } from 'fs';
import { marked } from 'marked';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const READWISE_TOKEN = process.env.READWISE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FILE_PATH = process.env.HOME + '/notes/Recent Thoughts.md';

if (!READWISE_TOKEN) {
  console.error('Error: READWISE_TOKEN environment variable not set');
  console.error('Get your token from: https://readwise.io/access_token');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable not set');
  console.error('Get your API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

function extractMostRecentEntry(markdown: string): string | null {
  // Split by H3 headers (###)
  const entries = markdown.split(/(?=^### )/m);

  // Get the last entry (most recent chronological)
  if (entries.length === 0) return null;

  const lastEntry = entries[entries.length - 1].trim();
  return lastEntry;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function generateThumbnail(entryContent: string): Promise<string> {
  console.log('🎨 Generating thumbnail with DALL-E 3...');

  // Create a prompt based on the entry content
  const prompt = `Create a minimalist, abstract thumbnail image that captures the essence of this thought: "${entryContent.slice(0, 500)}". Use a modern, clean aesthetic with vibrant colors.`;

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  });

  const imageUrl = response.data[0]?.url;
  if (!imageUrl) {
    throw new Error('No image URL returned from DALL-E');
  }

  console.log('✅ Thumbnail generated');
  return imageUrl;
}

async function uploadToReadwise() {
  try {
    // Read the markdown file
    const markdown = readFileSync(FILE_PATH, 'utf-8');

    // Extract the most recent entry
    const recentEntry = extractMostRecentEntry(markdown);
    if (!recentEntry) {
      console.error('No entries found in the markdown file');
      process.exit(1);
    }

    // Hash the entry
    const entryHash = hashContent(recentEntry);
    console.log('Entry hash:', entryHash);

    // Check if we've already generated an image for this entry
    let imageUrl: string;
    const existingImage = await prisma.generatedImage.findUnique({
      where: { entryHash },
    });

    if (existingImage) {
      console.log('📷 Using existing thumbnail');
      imageUrl = existingImage.imageUrl;

      // Delete old document if it exists
      if (existingImage.documentId) {
        console.log(`🗑️  Deleting old document ${existingImage.documentId}...`);
        const deleteResponse = await fetch(`https://readwise.io/api/v3/delete/${existingImage.documentId}/`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Token ${READWISE_TOKEN}`,
          },
        });

        if (deleteResponse.ok) {
          console.log('✅ Old document deleted');
        } else {
          const error = await deleteResponse.text();
          console.warn(`⚠️  Failed to delete old document: ${deleteResponse.status} ${error}`);
        }
      }
    } else {
      // Generate new thumbnail
      imageUrl = await generateThumbnail(recentEntry);

      // Save to database
      await prisma.generatedImage.create({
        data: {
          entryHash,
          imageUrl,
        },
      });
      console.log('💾 Saved thumbnail to database');
    }

    // Convert markdown to HTML
    const html = await marked(markdown);

    // Upload to Readwise Reader
    const response = await fetch('https://readwise.io/api/v3/save/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${READWISE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://localhost/recent-thoughts',
        html: html,
        title: 'Recent Thoughts',
        author: 'Jason Benn',
        image_url: imageUrl,
        tags: ['now-reading'],
        category: 'article',
        should_clean_html: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${response.status} ${error}`);
    }

    const result = await response.json();

    // Update database with new document ID
    await prisma.generatedImage.update({
      where: { entryHash },
      data: { documentId: result.id },
    });

    console.log('✅ Successfully uploaded to Readwise Reader');
    console.log('Document ID:', result.id);
    console.log('URL:', result.url);
  } finally {
    await prisma.$disconnect();
  }
}

uploadToReadwise().catch(console.error);
