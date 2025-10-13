#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PUBLISHED_DIR = "/Users/jasonbenn/notes/Neighborhood Notes/Published";
const PRIVATE_DIR = "/Users/jasonbenn/notes/Neighborhood Notes/Private";
const OUTPUT_FILE = path.join(PUBLISHED_DIR, "Recent changes.md");

// Parse a date from [[YYYY-MM-DD]] format
function parseLogDate(dateStr) {
  const match = dateStr.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
  return match ? new Date(match[1]) : null;
}

// Transform header for Readwise-optimized format
function transformHeaderForReadwise(header, sourceFile) {
  // Step 1: Extract date from headers and move it below
  const dateMatch = header.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/);
  let transformed = header.replace(/^### \[\[(\d{4}-\d{2}-\d{2})\]\] /, "### ");

  // Step 2: Remove #Question tag from anywhere in headers
  transformed = transformed.replace(/#Question:?/, "").replace(/\s+/g, " ").trim();

  // Step 3: Add date and source file link on a new line below the header
  let metadata = "";
  if (dateMatch) {
    metadata = `*[[${dateMatch[1]}]] - [[${sourceFile}]]*`;
  }

  return { header: transformed, metadata };
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

// Process all markdown files in a directory
function processDirectory(directory, fileFilter = (f) => f.endsWith(".md")) {
  const allEntries = [];
  const files = fs.readdirSync(directory).filter(fileFilter);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const entries = extractLogEntries(filePath, file);
    allEntries.push(...entries);
  }

  return allEntries;
}

function main() {
  // Extract log entries from published and private notes
  const allEntries = [
    ...processDirectory(
      PUBLISHED_DIR,
      (f) => f.endsWith(".md") && f !== "Recent changes.md"
    ),
    ...processDirectory(PRIVATE_DIR),
  ];

  // Sort entries by date (newest first)
  allEntries.sort((a, b) => b.date - a.date);

  // Generate output
  const output = [];

  for (const entry of allEntries) {
    // Transform header to Readwise-optimized format
    const { header, metadata } = transformHeaderForReadwise(entry.header, entry.sourceFile);
    output.push(header);
    if (metadata) {
      output.push(metadata);
    }
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
    console.error(
      `⚠ Failed to add ${path.basename(OUTPUT_FILE)} to git:`,
      error.message
    );
  }
}

main();
