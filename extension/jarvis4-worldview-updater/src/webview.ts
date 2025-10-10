import * as vscode from 'vscode';
import * as path from 'path';
import { HighlightDatabase } from './database';
import { ReadwiseClient } from './readwiseClient';
import type { ReadwiseHighlight, ReadwiseBookHighlights } from 'readwise-reader-api';

interface HighlightWithMeta {
  id: string;
  text: string;
  source_title: string;
  source_author?: string;
  highlighted_at?: string;
  snooze_count: number;
}

export class WebviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private highlights: Array<{ highlight: ReadwiseHighlight; book: ReadwiseBookHighlights }> = [];

  constructor(
    private context: vscode.ExtensionContext,
    private db: HighlightDatabase,
    private readwise: ReadwiseClient
  ) {}

  setHighlights(highlights: Array<{ highlight: ReadwiseHighlight; book: ReadwiseBookHighlights }>): void {
    this.highlights = highlights;
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'readwiseHighlights',
      'Readwise Highlights',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
        ]
      }
    );

    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.type) {
          case 'integrate':
            await this.handleIntegrate(message.highlightIds || [message.highlightId]);
            break;
          case 'snooze':
            await this.handleSnooze(message.highlightId);
            break;
          case 'archive':
            await this.handleArchive(message.highlightId);
            break;
          case 'snoozeAll':
            await this.handleSnoozeAll();
            break;
          case 'archiveAll':
            await this.handleArchiveAll();
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
    if (!this.panel) {return;}

    // Get visible highlight IDs from DB (NEW, not snoozed, or snooze ended)
    const visibleIds = this.db.getVisibleHighlightIds();

    // If we have highlights cached from recent fetch, use those
    // Otherwise, fetch all from API
    if (this.highlights.length === 0) {
      try {
        this.highlights = await this.readwise.fetchAllHighlightsWithBooks();
      } catch (error) {
        console.error('Failed to fetch highlights from Readwise:', error);
        vscode.window.showErrorMessage(`Failed to fetch highlights: ${error}`);
        return;
      }
    }

    // Filter to only visible IDs and limit to 30
    const highlightsToShow: HighlightWithMeta[] = this.highlights
      .filter(item => visibleIds.includes(String(item.highlight.id)))
      .slice(0, 30)
      .map(item => {
        const snoozeCount = this.db.getSnoozeCount(String(item.highlight.id));
        return {
          id: String(item.highlight.id),
          text: item.highlight.text,
          source_title: item.book.title || 'Unknown',
          source_author: item.book.author || undefined,
          highlighted_at: item.highlight.highlighted_at || undefined,
          snooze_count: snoozeCount
        };
      });

    this.panel.webview.postMessage({
      type: 'updateHighlights',
      highlights: highlightsToShow
    });
  }

  private async handleIntegrate(highlightIds: string[]): Promise<void> {
    // Read the worldview-update prompt template (bundled in extension)
    const promptPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'prompts',
      'worldview-update.md'
    );
    const promptDoc = await vscode.workspace.openTextDocument(promptPath);
    const basePrompt = promptDoc.getText();

    // Get highlights from cached API data
    const highlightTexts = highlightIds
      .map(id => this.highlights.find(item => String(item.highlight.id) === id))
      .filter(item => item !== undefined)
      .map(item => {
        const source = item!.book.author
          ? `${item!.book.title} by ${item!.book.author}`
          : item!.book.title;
        return `<highlight>\n${item!.highlight.text}\n— ${source}\n</highlight>`;
      })
      .join('\n\n');

    const fullPrompt = `${basePrompt}\n\n${highlightTexts}`;

    // Update status in DB for all
    for (const id of highlightIds) {
      this.db.updateStatus(id, 'INTEGRATED');
    }

    // Paste to Compose
    await this.pasteToCompose(fullPrompt);

    // Refresh view
    await this.refresh();
  }

  private async handleSnooze(highlightId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('readwise');
    const durationWeeks = config.get<number>('snoozeDurationWeeks') || 4;

    this.db.snoozeHighlight(highlightId, durationWeeks);
    await this.refresh();
  }

  private async handleArchive(highlightId: string): Promise<void> {
    this.db.updateStatus(highlightId, 'ARCHIVED');
    await this.refresh();
  }

  private async handleSnoozeAll(): Promise<void> {
    const config = vscode.workspace.getConfiguration('readwise');
    const durationWeeks = config.get<number>('snoozeDurationWeeks') || 4;

    const visibleIds = this.db.getVisibleHighlightIds();
    for (const id of visibleIds) {
      this.db.snoozeHighlight(id, durationWeeks);
    }
    await this.refresh();
  }

  private async handleArchiveAll(): Promise<void> {
    const visibleIds = this.db.getVisibleHighlightIds();
    for (const id of visibleIds) {
      this.db.updateStatus(id, 'ARCHIVED');
    }
    await this.refresh();
  }

  private async pasteToCompose(text: string): Promise<void> {
    // Cursor Compose has no programmatic API (as of 2025)
    // Use clipboard + AppleScript keyboard automation
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    // Escape text for AppleScript string
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

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
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'main.js'))
    );
    const styleUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'styles.css'))
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
