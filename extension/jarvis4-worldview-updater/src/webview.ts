import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { HighlightDatabase } from "./database";
import { ReadwiseClient } from "./readwiseClient";
import type {
  ReadwiseHighlight,
  ReadwiseBookHighlights,
} from "readwise-reader-api";

const LOG_FILE = '/tmp/readwise-search.log';

function log(...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')}\n`;
  fs.appendFileSync(LOG_FILE, message);
  console.log(...args);
}

interface HighlightWithMeta {
  id: string;
  text: string;
  source_title: string;
  source_author?: string;
  highlighted_at?: string;
  snooze_count: number;
  book_id: number;
}

export class WebviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private highlights: Array<{
    highlight: ReadwiseHighlight;
    book: ReadwiseBookHighlights;
  }> = [];

  constructor(
    private context: vscode.ExtensionContext,
    private db: HighlightDatabase,
    private readwise: ReadwiseClient
  ) {}

  setHighlights(
    highlights: Array<{
      highlight: ReadwiseHighlight;
      book: ReadwiseBookHighlights;
    }>
  ): void {
    this.highlights = highlights;
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "readwiseHighlights",
      "Readwise Highlights",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, "media")),
        ],
      }
    );

    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "integrate":
            await this.handleIntegrate(
              message.highlightIds || [message.highlightId]
            );
            break;
          case "snooze":
            await this.handleSnooze(
              message.highlightIds || [message.highlightId]
            );
            break;
          case "archive":
            await this.handleArchive(
              message.highlightIds || [message.highlightId]
            );
            break;
          case "snoozeAll":
            await this.handleSnoozeAll();
            break;
          case "archiveAll":
            await this.handleArchiveAll();
            break;
          case "openUrl":
            await vscode.env.openExternal(vscode.Uri.parse(message.url));
            break;
          case "search":
            await this.handleSearch(message.query);
            break;
          case "searchSimilar":
            await this.handleSearch(message.query);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel) {
      return;
    }

    // Get visible highlights WITH book data from DB
    const visibleHighlights = await this.db.getVisibleHighlightIds();

    // Transform to display format and limit to 30
    const highlightsToShow: HighlightWithMeta[] = visibleHighlights
      .slice(0, 30)
      .map((highlight: any) => {
        const snoozeCount = highlight.snoozeHistory
          ? JSON.parse(highlight.snoozeHistory).length
          : 0;

        return {
          id: highlight.id,
          text: highlight.text || "",
          source_title: highlight.book?.title || "Unknown",
          source_author: highlight.book?.author || undefined,
          highlighted_at: highlight.highlightedAt || undefined,
          snooze_count: snoozeCount,
          book_id: highlight.bookId,
        };
      }) as HighlightWithMeta[];

    this.panel.webview.postMessage({
      type: "updateHighlights",
      highlights: highlightsToShow,
    });
  }

  startLoading(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: "startLoading" });
    }
  }

  stopLoading(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: "stopLoading" });
    }
  }

  private async handleIntegrate(highlightIds: string[]): Promise<void> {
    // Get highlights from DB with book data
    const highlightTexts = await Promise.all(
      highlightIds.map(async (id) => {
        const highlight = await this.db.getHighlightState(id);
        if (!highlight || !highlight.book) return null;

        const source = highlight.book.author
          ? `${highlight.book.title} by ${highlight.book.author}`
          : highlight.book.title;
        const readwiseUrl = `wiseread:///read/${highlight.bookId}`;
        return `<highlight>\n${highlight.text}\n— ${source}\n— ${readwiseUrl}\n</highlight>`;
      })
    );

    const validTexts = highlightTexts.filter(t => t !== null).join("\n\n");

    // Update status in DB for all
    for (const id of highlightIds) {
      await this.db.updateStatus(id, "INTEGRATED");
    }

    // Use /worldview command instead of pasting full prompt
    await this.useWorldviewCommand(validTexts);

    // Refresh view
    await this.refresh();
  }

  private async handleSnooze(highlightIds: string[]): Promise<void> {
    const config = vscode.workspace.getConfiguration("readwise");
    const durationWeeks = config.get<number>("snoozeDurationWeeks") || 4;

    for (const id of highlightIds) {
      await this.db.snoozeHighlight(id, durationWeeks);
    }
    await this.refresh();
  }

  private async handleArchive(highlightIds: string[]): Promise<void> {
    for (const id of highlightIds) {
      await this.db.updateStatus(id, "ARCHIVED");
    }
    await this.refresh();
  }

  private async handleSnoozeAll(): Promise<void> {
    const config = vscode.workspace.getConfiguration("readwise");
    const durationWeeks = config.get<number>("snoozeDurationWeeks") || 4;

    const visibleIds = await this.db.getVisibleHighlightIds();
    for (const id of visibleIds) {
      await this.db.snoozeHighlight(id, durationWeeks);
    }
    await this.refresh();
  }

  private async handleArchiveAll(): Promise<void> {
    const visibleIds = await this.db.getVisibleHighlightIds();
    for (const id of visibleIds) {
      await this.db.updateStatus(id, "ARCHIVED");
    }
    await this.refresh();
  }

  private async handleSearch(query: string): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      log('handleSearch called with query:', query);
      // Use Readwise MCP vector search API
      const results = await this.readwise.searchHighlights(query);

      log('Search results sample:', results.slice(0, 2));

      const matchingHighlights: HighlightWithMeta[] = await Promise.all(
        results
          .slice(0, 30)
          .map(async (result) => {
            const highlightId = String(result.id);
            const snoozeCount = await this.db.getSnoozeCount(highlightId);

            // Get the full highlight from DB to get the book ID
            const highlightState = await this.db.getHighlightState(highlightId);
            const bookId = highlightState?.bookId || 0;

            return {
              id: highlightId,
              text: result.attributes.highlight_plaintext,
              source_title: result.attributes.document_title || "Unknown",
              source_author: result.attributes.document_author,
              highlighted_at: undefined, // Not provided in MCP response
              snooze_count: snoozeCount,
              book_id: bookId,
            };
          })
      );

      this.panel.webview.postMessage({
        type: "searchResults",
        highlights: matchingHighlights,
      });
    } catch (error) {
      console.error("Search failed:", error);
      vscode.window.showErrorMessage(`Search failed: ${error}`);
    }
  }

  private async useWorldviewCommand(highlightTexts: string): Promise<void> {
    // Need to type /worldview, press Enter, then paste highlights underneath
    const { exec } = require("child_process");
    const util = require("util");
    const execPromise = util.promisify(exec);

    // Escape highlight text for AppleScript string
    const escapedHighlights = highlightTexts
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");

    const script = `
      set the clipboard to "${escapedHighlights}"
      tell application "Cursor"
        activate
        delay 0.2
        tell application "System Events"
          keystroke "i" using {command down}
          delay 0.3
          keystroke "/worldview"
          key code 36
          delay 0.2
          keystroke "v" using {command down}
        end tell
      end tell
    `;

    try {
      await execPromise(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to use worldview command: ${error}`
      );
    }
  }

  private async pasteToCompose(text: string): Promise<void> {
    // Cursor Compose has no programmatic API (as of 2025)
    // Use clipboard + AppleScript keyboard automation
    const { exec } = require("child_process");
    const util = require("util");
    const execPromise = util.promisify(exec);

    // Escape text for AppleScript string
    const escapedText = text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");

    const script = `
      set the clipboard to "${escapedText}"
      tell application "Cursor"
        activate
        delay 0.2
        tell application "System Events"
          keystroke "i" using {command down}
          delay 0.3
          keystroke "v" using {command down}
        end tell
      end tell
    `;

    try {
      await execPromise(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to paste to Compose: ${error}`);
    }
  }

  private getWebviewContent(): string {
    const scriptUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, "media", "main.js"))
    );
    const styleUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, "media", "styles.css")
      )
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleUri}">
      <title>Readwise Highlights</title>
    </head>
    <body>
      <div id="app">
        <div id="search-ui" style="display: none; margin-bottom: 10px;">
          <input type="text" id="search-input" placeholder="Search highlights... (press Enter)" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground);">
        </div>
        <div id="highlights-container"></div>
        <div class="actions">
          <button id="snooze-all">Snooze All</button>
          <button id="archive-all">Archive All</button>
        </div>
      </div>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}
