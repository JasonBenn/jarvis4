import { readFileSync } from "fs";
import { marked } from "marked";
import OpenAI from "openai";
import "dotenv/config";

const READWISE_TOKEN = process.env.READWISE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FILE_PATH =
  "/Users/jasonbenn/notes/Neighborhood Notes/Published/Recent changes.md";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function extractLastEntry(markdown: string): string | null {
  // Split by H3 headers (###)
  const entries = markdown.split(/(?=^### )/m);

  // Get the last entry (most recent chronological)
  if (entries.length === 0) return null;

  const lastEntry = entries[entries.length - 1].trim();
  return lastEntry;
}

async function generateThumbnail(entryContent: string): Promise<string> {
  console.log("🎨 Generating thumbnail with DALL-E 3...");

  // Create a prompt based on the entry content
  const prompt = `Create a minimalist, abstract thumbnail image that captures the essence of this thought: "${entryContent.slice(
    0,
    500
  )}". Use a modern, clean aesthetic with vibrant colors.`;

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });

  const imageUrl = response.data[0]?.url;
  if (!imageUrl) {
    throw new Error("No image URL returned from DALL-E");
  }

  console.log("✅ Thumbnail generated");
  return imageUrl;
}

async function findAndDeleteExistingDocument(): Promise<void> {
  console.log("🔍 Searching for existing 'Recent Changes' document...");

  // Search for documents with the title and tag - use tag filter in query params
  const searchResponse = await fetch(
    "https://readwise.io/api/v3/list/?tag=now-reading",
    {
      method: "GET",
      headers: {
        Authorization: `Token ${READWISE_TOKEN}`,
      },
    }
  );

  if (!searchResponse.ok) {
    console.log("⚠️  Could not search for existing documents, continuing...");
    return;
  }

  const searchResult = await searchResponse.json();

  // Find document with matching title (already filtered by tag via API)
  const existingDoc = searchResult.results?.find(
    (doc: any) => doc.title === "Recent Changes"
  );

  if (existingDoc) {
    console.log(`🗑️  Deleting existing document ${existingDoc.id}...`);

    const deleteResponse = await fetch(
      `https://readwise.io/api/v3/delete/${existingDoc.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Token ${READWISE_TOKEN}`,
        },
      }
    );

    if (deleteResponse.ok) {
      console.log("✅ Existing document deleted");
    } else {
      console.log("⚠️  Could not delete existing document, continuing...");
    }
  } else {
    console.log("📄 No existing document found");
  }
}

async function uploadToReadwise() {
  try {
    // Read the markdown file
    const markdown = readFileSync(FILE_PATH, "utf-8");

    // Extract the last entry for thumbnail generation
    const lastEntry = extractLastEntry(markdown);
    let imageUrl: string | undefined;

    if (lastEntry) {
      // Generate thumbnail based on the last entry
      imageUrl = await generateThumbnail(lastEntry);
    }

    // Find and delete existing document
    await findAndDeleteExistingDocument();

    // Promote headers for Readwise (### -> ##, ##### -> ###)
    let processedMarkdown = markdown;
    processedMarkdown = processedMarkdown.replace(/^##### /gm, "### ");
    processedMarkdown = processedMarkdown.replace(/^### /gm, "## ");

    // Convert markdown to HTML
    const html = await marked(processedMarkdown);

    // Upload to Readwise Reader
    const uploadPayload: any = {
      url: "https://localhost/recent-changes",
      html: html,
      title: "Recent Changes",
      author: "Jason Benn",
      tags: ["now-reading"],
      category: "article",
      should_clean_html: false,
    };

    // Add image URL if we generated one
    if (imageUrl) {
      uploadPayload.image_url = imageUrl;
    }

    const response = await fetch("https://readwise.io/api/v3/save/", {
      method: "POST",
      headers: {
        Authorization: `Token ${READWISE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(uploadPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${response.status} ${error}`);
    }

    const result = await response.json();

    console.log("✅ Successfully uploaded to Readwise Reader");
    console.log("Document ID:", result.id);
    console.log("URL:", result.url);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

uploadToReadwise().catch(console.error);
