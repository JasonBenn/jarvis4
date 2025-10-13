#!/usr/bin/env tsx

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PUBLISHED_DIR = "/Users/jasonbenn/notes/Neighborhood Notes/Published";
const PRIVATE_DIR = "/Users/jasonbenn/notes/Neighborhood Notes/Private";
const OUTPUT_FILE = path.join(PUBLISHED_DIR, "Recent changes.md");
const NOTES_ROOT = "/Users/jasonbenn/notes/Neighborhood Notes";

interface LogEntry {
  date: Date;
  dateStr: string;
  header: string;
  body: string[];
  sourceFile: string;
  type: "question" | "created" | "updated";
  pithyPhrase?: string;
}

interface GroupedEntry {
  date: string;
  created: Array<{ file: string; phrase: string }>;
  updated: Array<{ file: string; phrase: string }>;
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

// Get file modification date in YYYY-MM-DD format
function getFileDate(filePath: string): string {
  const stats = fs.statSync(filePath);
  return stats.mtime.toISOString().split("T")[0];
}

// Parse a date from [[YYYY-MM-DD]] format
function parseLogDate(dateStr: string): Date | null {
  const match = dateStr.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
  return match ? new Date(match[1]) : null;
}

// Get git diff files with their status
function getGitDiffFiles(): { modified: string[]; untracked: string[] } {
  try {
    // Get modified and staged files
    const modifiedOutput = execSync("git diff --name-only HEAD", {
      cwd: NOTES_ROOT,
      encoding: "utf-8",
    });
    const modified = modifiedOutput
      .split("\n")
      .filter((f) => f.endsWith(".md"))
      .map((f) => path.join(NOTES_ROOT, f));

    // Get untracked files
    const untrackedOutput = execSync("git ls-files --others --exclude-standard", {
      cwd: NOTES_ROOT,
      encoding: "utf-8",
    });
    const untracked = untrackedOutput
      .split("\n")
      .filter((f) => f.endsWith(".md"))
      .map((f) => path.join(NOTES_ROOT, f));

    return { modified, untracked };
  } catch (error) {
    console.error("⚠ Failed to get git diff:", error);
    return { modified: [], untracked: [] };
  }
}

// Check if file has a changelog section
function hasChangelogSection(content: string): boolean {
  return /^## Changelog$/m.test(content);
}

// Check if file has a Created entry (any entry is considered a created entry for new files)
function hasCreatedEntry(content: string): boolean {
  return /^### \[\[\d{4}-\d{2}-\d{2}\]\]/m.test(content);
}

// Check if file has an entry for today
function hasUpdatedEntryForToday(content: string, today: string): boolean {
  const regex = new RegExp(`^### \\[\\[${today}\\]\\]`, "m");
  return regex.test(content);
}

// Generate pithy phrase using AI based on file diff
async function generatePithyPhrase(
  filePath: string,
  type: "created" | "updated"
): Promise<string> {
  const fileName = path.basename(filePath);
  const relativePath = path.relative(NOTES_ROOT, filePath);

  try {
    // Get the diff or full content
    const diff = getFileDiff(relativePath);

    if (!diff) {
      return path.basename(filePath, ".md");
    }

    const prompt = type === "created"
      ? `Generate a short phrase (3-10 words, no complete sentence) describing the core thesis or purpose of this new note:\n\n${diff}`
      : `Generate a short phrase (3-10 words, no complete sentence) describing what changed in this note update:\n\n${diff}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You generate short phrases (3-10 words) for note changes, not complete sentences. Be specific and capture the essence.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 100,
    });

    const result = response.choices[0]?.message?.content?.trim();

    return result || path.basename(filePath, ".md");
  } catch (error) {
    console.error(`⚠ Failed to generate AI phrase for ${fileName}:`, error);
    return path.basename(filePath, ".md");
  }
}

// Add changelog entries to a file
async function addChangelogEntry(filePath: string, isUntracked: boolean) {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileDate = getFileDate(filePath);
  let modified = false;
  let newContent = content;

  // Add Changelog section if missing
  if (!hasChangelogSection(content)) {
    newContent += "\n\n## Changelog\n";
    modified = true;
  }

  if (isUntracked) {
    // For untracked files, add Created entry if missing
    if (!hasCreatedEntry(newContent)) {
      const phrase = await generatePithyPhrase(filePath, "created");
      newContent += `\n### [[${fileDate}]] ${phrase}\n`;
      modified = true;
      console.log(`  ✓ Added Created entry to ${path.basename(filePath)}`);
    }
  } else {
    // For modified files, add Updated entry if missing for today
    if (!hasUpdatedEntryForToday(newContent, fileDate)) {
      const phrase = await generatePithyPhrase(filePath, "updated");
      // Insert after ## Changelog
      const changelogIndex = newContent.indexOf("## Changelog");
      const insertIndex = newContent.indexOf("\n", changelogIndex) + 1;
      newContent =
        newContent.slice(0, insertIndex) +
        `\n### [[${fileDate}]] ${phrase}\n` +
        newContent.slice(insertIndex);
      modified = true;
      console.log(`  ✓ Added Updated entry to ${path.basename(filePath)}`);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, newContent, "utf-8");
  }
}

// Process git diff files
async function processGitDiff() {
  const { modified, untracked } = getGitDiffFiles();

  // Exclude Recent changes.md from processing
  const filteredModified = modified.filter(f => !f.endsWith("Recent changes.md"));
  const filteredUntracked = untracked.filter(f => !f.endsWith("Recent changes.md"));

  const totalFiles = filteredModified.length + filteredUntracked.length;

  if (totalFiles === 0) {
    console.log("ℹ No changed markdown files in git diff");
    return;
  }

  console.log(`\nProcessing ${totalFiles} changed file(s)...`);

  for (const file of filteredUntracked) {
    if (fs.existsSync(file)) {
      await addChangelogEntry(file, true);
    }
  }

  for (const file of filteredModified) {
    if (fs.existsSync(file)) {
      await addChangelogEntry(file, false);
    }
  }
}

// Transform header for Readwise-optimized format
function transformHeaderForReadwise(
  header: string,
  sourceFile: string
): { header: string; metadata: string } {
  const dateMatch = header.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
  let transformed = header.replace(/^### \[\[(\d{4}-\d{2}-\d{2})\]\] /, "### ");
  transformed = transformed.replace(/#Question:?/, "").replace(/\s+/g, " ").trim();

  let metadata = "";
  if (dateMatch) {
    metadata = `*[[${dateMatch[1]}]] - [[${sourceFile}]]*`;
  }

  return { header: transformed, metadata };
}

// Extract log entries from a single file
function extractLogEntries(filePath: string, fileName: string): LogEntry[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const entries: LogEntry[] = [];

  let inLogEntry = false;
  let currentEntry: LogEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if we hit ## Changelog - stop adding to body
    if (line.match(/^## Changelog$/)) {
      if (currentEntry) {
        entries.push(currentEntry);
        currentEntry = null;
      }
      inLogEntry = false;
      continue;
    }

    // Check if this is a log entry header (### [[YYYY-MM-DD]] ...)
    const logMatch = line.match(/^### (\[\[\d{4}-\d{2}-\d{2}\]\].*)$/);

    if (logMatch) {
      // Save previous entry if exists
      if (currentEntry) {
        entries.push(currentEntry);
      }

      // Determine entry type
      const hasQuestion = /#Question/i.test(line);

      let type: "question" | "created" | "updated" = "question";
      let pithyPhrase: string | undefined;

      if (!hasQuestion) {
        // Extract the phrase after the date
        const match = line.match(/^### \[\[\d{4}-\d{2}-\d{2}\]\]\s*(.+)$/);
        pithyPhrase = match ? match[1].trim() : undefined;

        // Determine if it's created or updated based on whether it's the oldest entry
        // For now, we'll mark them as "created" and later determine the actual type
        // based on file creation date vs entry date
        type = "created";
      }

      // Start new entry
      const dateMatch = line.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
      currentEntry = {
        date: parseLogDate(line) || new Date(),
        dateStr: dateMatch ? dateMatch[1] : "",
        header: line,
        body: [],
        sourceFile: fileName,
        type,
        pithyPhrase,
      };
      inLogEntry = true;
    } else if (inLogEntry && currentEntry) {
      currentEntry.body.push(line);
    }
  }

  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

// Process all markdown files in a directory
function processDirectory(
  directory: string,
  fileFilter: (f: string) => boolean = (f) => f.endsWith(".md")
): LogEntry[] {
  const allEntries: LogEntry[] = [];
  const files = fs.readdirSync(directory).filter(fileFilter);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const entries = extractLogEntries(filePath, file);
    allEntries.push(...entries);
  }

  return allEntries;
}

// Group Created/Updated entries by date
function groupEntriesByDate(entries: LogEntry[]): GroupedEntry[] {
  const groups = new Map<string, GroupedEntry>();

  for (const entry of entries) {
    if (entry.type === "created" || entry.type === "updated") {
      if (!groups.has(entry.dateStr)) {
        groups.set(entry.dateStr, {
          date: entry.dateStr,
          created: [],
          updated: [],
        });
      }

      const group = groups.get(entry.dateStr)!;
      const fileName = entry.sourceFile.replace(/\.md$/, "");
      const phrase = entry.pithyPhrase || "";

      if (entry.type === "created") {
        group.created.push({ file: fileName, phrase });
      } else {
        group.updated.push({ file: fileName, phrase });
      }
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// Get git diff for a file
function getFileDiff(fileName: string): string {
  try {
    const filePath = path.join(NOTES_ROOT, fileName);

    // Check if file is untracked
    const untrackedOutput = execSync("git ls-files --others --exclude-standard", {
      cwd: NOTES_ROOT,
      encoding: "utf-8",
    });
    const isUntracked = untrackedOutput.split("\n").some(f =>
      path.join(NOTES_ROOT, f) === filePath
    );

    if (isUntracked) {
      // For new files, return the entire content
      const content = fs.readFileSync(filePath, "utf-8");
      return `+++ NEW FILE: ${fileName}\n${content}`;
    } else {
      // For modified files, get the diff
      const diff = execSync(`git diff HEAD -- "${fileName}"`, {
        cwd: NOTES_ROOT,
        encoding: "utf-8",
      });
      return diff || "";
    }
  } catch (error) {
    return "";
  }
}

// Generate a pithy title for grouped entries using AI
async function generateGroupTitle(group: GroupedEntry): Promise<string> {
  // Instead of full diffs, use the pithy phrases we already generated
  const phrases = [...group.created, ...group.updated].map(({ phrase }) => phrase);

  if (phrases.length === 0) {
    return "Updates";
  }

  const combinedPhrases = phrases.join("\n- ");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You generate pithy, concise titles (3-8 words, no complete sentences) for a group of related note changes. Capture the core themes. Use comma-separated concepts. Use lowercase (no title case).",
        },
        {
          role: "user",
          content: `Generate a pithy title summarizing these note summaries (use lowercase, not title case):\n\n- ${combinedPhrases}`,
        },
      ],
      max_completion_tokens: 50,
    });

    const result = response.choices[0]?.message?.content?.trim();
    return result || "Updates";
  } catch (error) {
    console.error("⚠ Failed to generate AI title:", error);
    // Fallback to simple word extraction
    const concepts: string[] = [];
    [...group.created, ...group.updated].forEach(({ phrase }) => {
      const words = phrase.split(/[,\s]+/).filter((w) => w.length > 3);
      concepts.push(...words.slice(0, 2));
    });
    const unique = [...new Set(concepts)].slice(0, 5);
    return unique.join(", ");
  }
}

async function main() {
  console.log("=== Automated Changelog ===\n");

  // Step 1: Process git diff files
  await processGitDiff();

  console.log("\n=== Compiling Recent Changes ===\n");

  // Step 2: Extract log entries from published and private notes
  const allEntries = [
    ...processDirectory(
      PUBLISHED_DIR,
      (f) => f.endsWith(".md") && f !== "Recent changes.md"
    ),
    ...processDirectory(PRIVATE_DIR),
  ];

  // Separate question entries from created/updated
  const questionEntries = allEntries.filter((e) => e.type === "question");
  const groupedEntries = groupEntriesByDate(allEntries);

  // Create a combined list with dates for interleaving
  type OutputEntry =
    | { type: "question"; date: Date; entry: LogEntry }
    | { type: "group"; date: Date; group: GroupedEntry };

  const combinedEntries: OutputEntry[] = [
    ...questionEntries.map((e) => ({ type: "question" as const, date: e.date, entry: e })),
    ...groupedEntries.map((g) => ({ type: "group" as const, date: new Date(g.date), group: g })),
  ];

  // Sort all entries by date (newest first)
  combinedEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Generate output
  const output: string[] = [];

  for (const item of combinedEntries) {
    if (item.type === "question") {
      const { header, metadata } = transformHeaderForReadwise(
        item.entry.header,
        item.entry.sourceFile
      );
      output.push(header);
      if (metadata) {
        output.push(metadata);
      }

      // Remove trailing empty lines from body before joining
      const body = [...item.entry.body];
      while (body.length > 0 && body[body.length - 1] === "") {
        body.pop();
      }
      output.push(body.join("\n"));
    } else {
      const title = await generateGroupTitle(item.group);
      output.push(`### Changes: ${title}`);
      output.push(`*[[${item.group.date}]]*`);

      for (const { file, phrase } of item.group.created) {
        output.push(`- Created [[${file}]]: ${phrase}`);
      }
      for (const { file, phrase } of item.group.updated) {
        output.push(`- Updated [[${file}]]: ${phrase}`);
      }
    }
  }

  // Write to output file
  fs.writeFileSync(OUTPUT_FILE, output.join("\n"), "utf-8");

  console.log(
    `✓ Compiled ${questionEntries.length} questions + ${groupedEntries.length} grouped entries to ${OUTPUT_FILE}`
  );

  // Add the file to git staging
  try {
    execSync(`git add "${OUTPUT_FILE}"`, { cwd: path.dirname(PUBLISHED_DIR) });
    console.log(`✓ Added ${path.basename(OUTPUT_FILE)} to git staging`);
  } catch (error) {
    console.error(
      `⚠ Failed to add ${path.basename(OUTPUT_FILE)} to git:`,
      (error as Error).message
    );
  }
}

main();
