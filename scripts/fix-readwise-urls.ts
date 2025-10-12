import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface Citation {
  file: string;
  footnoteRef: string;
  author: string;
  title: string;
  url: string | null;
  fullText: string;
  lineNumber: number;
}

interface UnmatchedQuote {
  file: string;
  quote: string;
  citation: string;
}

const PRIVATE_DIR = '/Users/jasonbenn/notes/Neighborhood Notes/Private';
const PUBLISHED_DIR = '/Users/jasonbenn/notes/Neighborhood Notes/Published';

async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getAllMarkdownFiles(fullPath);
      } else if (entry.name.endsWith('.md')) {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat();
}

function parseCitations(content: string, filePath: string): Citation[] {
  const citations: Citation[] = [];
  const lines = content.split('\n');

  // Match footnotes like: [^1]: Author, [Title](url)
  // or [^1]: Author, [Title](wiseread:///read/123)
  const footnoteRegex = /^\[\^(\d+)\]:\s*(.+)$/;

  lines.forEach((line, index) => {
    const match = line.match(footnoteRegex);
    if (match) {
      const footnoteRef = match[1];
      const citationText = match[2];

      // Try to parse author, title, and URL
      // Pattern: "Author, [Title](url)" or "[Title](url)" or just "Title - url"
      const markdownLinkMatch = citationText.match(/\[([^\]]+)\]\(([^\)]+)\)/);

      let author = '';
      let title = '';
      let url: string | null = null;

      if (markdownLinkMatch) {
        title = markdownLinkMatch[1];
        url = markdownLinkMatch[2];

        // Extract author if present before the link
        const beforeLink = citationText.substring(0, citationText.indexOf('['));
        if (beforeLink.trim()) {
          author = beforeLink.trim().replace(/,$/, '');
        }
      }

      citations.push({
        file: filePath,
        footnoteRef,
        author,
        title,
        url,
        fullText: citationText,
        lineNumber: index + 1,
      });
    }
  });

  return citations;
}

function needsFixing(citation: Citation): boolean {
  if (!citation.url) return false;

  // Check if it's a wiseread:// URL or any URL that's not a proper Readwise URL
  if (citation.url.startsWith('wiseread:///read/')) {
    return true;
  }

  // If it's not a Readwise URL at all, it might be a direct source URL
  if (!citation.url.startsWith('https://read.readwise.io/read/')) {
    return false; // Don't try to fix non-Readwise URLs
  }

  return false;
}

async function findHighlightByTitle(title: string): Promise<string | null> {
  // Try to find a book by title
  const book = await prisma.book.findFirst({
    where: {
      OR: [
        { title: { contains: title } },
        { readableTitle: { contains: title } },
      ],
    },
  });

  if (book && book.readwiseUrl) {
    return book.readwiseUrl;
  }

  // Try to find a highlight where the note or book title matches
  const highlight = await prisma.highlight.findFirst({
    where: {
      book: {
        OR: [
          { title: { contains: title } },
          { readableTitle: { contains: title } },
        ],
      },
    },
    include: {
      book: true,
    },
  });

  if (highlight?.book?.readwiseUrl) {
    return highlight.book.readwiseUrl;
  }

  return null;
}

async function extractWisereadId(url: string): Promise<string | null> {
  // Extract ID from wiseread:///read/12345
  const match = url.match(/wiseread:\/\/\/read\/(\d+)/);
  return match ? match[1] : null;
}

async function findProperReadwiseUrl(citation: Citation): Promise<string | null> {
  if (!citation.url) return null;

  // If it's a wiseread URL, extract the ID
  if (citation.url.startsWith('wiseread:///read/')) {
    const id = await extractWisereadId(citation.url);
    if (id) {
      // Check if this highlight exists in our database
      const highlight = await prisma.highlight.findFirst({
        where: { id },
        include: { book: true },
      });

      if (highlight?.readwiseUrl) {
        return highlight.readwiseUrl;
      }

      if (highlight?.book?.readwiseUrl) {
        return highlight.book.readwiseUrl;
      }

      // If we have the ID but no URL, construct it
      return `https://read.readwise.io/read/${id}`;
    }
  }

  // Try to match by title
  return await findHighlightByTitle(citation.title);
}

async function updateFileWithNewUrl(
  filePath: string,
  oldText: string,
  newUrl: string
): Promise<void> {
  let content = await fs.readFile(filePath, 'utf-8');

  // Replace the URL in the citation
  const oldUrlMatch = oldText.match(/\(([^\)]+)\)/);
  if (oldUrlMatch) {
    const oldUrl = oldUrlMatch[1];
    content = content.replace(oldUrl, newUrl);
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

async function main() {
  console.log('Finding all markdown files...');
  const privateFiles = await getAllMarkdownFiles(PRIVATE_DIR);
  const publishedFiles = await getAllMarkdownFiles(PUBLISHED_DIR);
  const allFiles = [...privateFiles, ...publishedFiles];

  console.log(`Found ${allFiles.length} markdown files\n`);

  const citationsNeedingFix: Citation[] = [];
  const unmatchedQuotes: UnmatchedQuote[] = [];
  let fixedCount = 0;

  // Parse all files and find citations that need fixing
  for (const file of allFiles) {
    const content = await fs.readFile(file, 'utf-8');
    const citations = parseCitations(content, file);

    for (const citation of citations) {
      if (needsFixing(citation)) {
        citationsNeedingFix.push(citation);
      }
    }
  }

  console.log(`Found ${citationsNeedingFix.length} citations that need fixing\n`);

  // Try to find proper URLs for each citation
  for (const citation of citationsNeedingFix) {
    console.log(`Processing: ${citation.title} (${path.basename(citation.file)}:${citation.lineNumber})`);

    const properUrl = await findProperReadwiseUrl(citation);

    if (properUrl && properUrl !== citation.url) {
      console.log(`  ✓ Found: ${properUrl}`);
      await updateFileWithNewUrl(citation.file, citation.fullText, properUrl);
      fixedCount++;
    } else {
      console.log(`  ✗ No match found`);

      // Find the quote that references this footnote
      const content = await fs.readFile(citation.file, 'utf-8');
      const quoteRegex = new RegExp(`(.{0,100})\\[\\^${citation.footnoteRef}\\]`, 'g');
      const match = quoteRegex.exec(content);

      if (match) {
        unmatchedQuotes.push({
          file: path.basename(citation.file),
          quote: match[1].trim(),
          citation: citation.fullText,
        });
      }
    }
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Fixed: ${fixedCount} citations`);
  console.log(`Unmatched: ${unmatchedQuotes.length} citations\n`);

  if (unmatchedQuotes.length > 0) {
    console.log(`\n=== QUOTES WITHOUT FOUND SOURCES ===\n`);
    for (const unmatched of unmatchedQuotes) {
      console.log(`File: ${unmatched.file}`);
      console.log(`Quote: ...${unmatched.quote}`);
      console.log(`Citation: ${unmatched.citation}`);
      console.log('---\n');
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
