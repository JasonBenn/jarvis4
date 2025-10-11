#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PUBLISHED_DIR = "/Users/jasonbenn/notes/Neighborhood Notes/Published";
const OUTPUT_FILE = path.join(PUBLISHED_DIR, "Recent changes.md");

// Parse a date from [[YYYY-MM-DD]] format
function parseLogDate(dateStr) {
  const match = dateStr.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
  return match ? new Date(match[1]) : null;
}

// Extract log entries from a single file
function extractLogEntries(filePath, fileName) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const entries = [];

  let inLogEntry = false;
  let currentEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a log entry header (### [[YYYY-MM-DD]] ...)
    const logMatch = line.match(/^### (\[\[\d{4}-\d{2}-\d{2}\]\].*)/);

    if (logMatch) {
      // Save previous entry if exists
      if (currentEntry) {
        entries.push(currentEntry);
      }

      // Start new entry
      const dateMatch = line.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
      currentEntry = {
        date: parseLogDate(line),
        dateStr: dateMatch ? dateMatch[1] : "",
        header: line,
        body: [],
        sourceFile: fileName,
      };
      inLogEntry = true;
    } else if (inLogEntry) {
      currentEntry.body.push(line);
    }
  }

  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

function main() {
  const allEntries = [];

  const files = fs
    .readdirSync(PUBLISHED_DIR)
    .filter((f) => f.endsWith(".md") && f !== "Recent changes.md");

  // Extract log entries from each file
  for (const file of files) {
    const filePath = path.join(PUBLISHED_DIR, file);
    const entries = extractLogEntries(filePath, file);
    allEntries.push(...entries);
  }

  // Sort entries by date (newest first)
  allEntries.sort((a, b) => b.date - a.date);

  // Generate output
  const output = [];
  output.push("# Recent Changes\n");

  for (const entry of allEntries) {
    output.push(entry.header);
    output.push(entry.body.join("\n"));
    output.push(""); // blank line between entries
  }

  // Write to output file
  fs.writeFileSync(OUTPUT_FILE, output.join("\n"), "utf-8");

  console.log(`✓ Extracted ${allEntries.length} log entries to ${OUTPUT_FILE}`);

  // Add the file to git staging if running as a git hook
  try {
    execSync(`git add "${OUTPUT_FILE}"`, { cwd: path.dirname(PUBLISHED_DIR) });
    console.log(`✓ Added ${path.basename(OUTPUT_FILE)} to git staging`);
  } catch (error) {
    console.error(`⚠ Failed to add ${path.basename(OUTPUT_FILE)} to git:`, error.message);
  }
}

main();
