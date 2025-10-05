import * as vscode from 'vscode';
import { HighlightDatabase } from './database';
import { ReadwiseClient } from './readwiseClient';
import { WebviewManager } from './webview';

export function registerCommands(
  context: vscode.ExtensionContext,
  db: HighlightDatabase,
  readwise: ReadwiseClient,
  webview: WebviewManager
) {
  // Main command: fetch and show
  context.subscriptions.push(
    vscode.commands.registerCommand('readwise.fetchAndShow', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching Readwise highlights...',
        cancellable: false
      }, async (progress) => {
        try {
          // Get last fetch time from workspace state
          const lastFetch = context.workspaceState.get<string>('lastReadwiseFetch');

          // Fetch highlights
          progress.report({ message: 'Downloading from Readwise...' });
          const highlightData = await readwise.fetchAllHighlightsWithBooks(lastFetch);

          // Store highlights in webview manager
          webview.setHighlights(highlightData);

          // Track new highlights in database
          progress.report({ message: 'Processing highlights...' });
          let newCount = 0;
          for (const item of highlightData) {
            const highlightId = String(item.highlight.id);
            const existingState = await db.getHighlightState(highlightId);
            if (!existingState) {
              await db.trackHighlight(highlightId);
              newCount++;
            }
          }

          // Update last fetch time
          await context.workspaceState.update('lastReadwiseFetch', new Date().toISOString());

          // Show webview
          await webview.show();

          vscode.window.showInformationMessage(
            `Fetched ${highlightData.length} highlights from Readwise (${newCount} new)`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Error fetching highlights: ${error}`);
        }
      });
    })
  );

  // Command to just show panel (without fetching)
  context.subscriptions.push(
    vscode.commands.registerCommand('readwise.showPanel', async () => {
      await webview.show();
    })
  );
}
