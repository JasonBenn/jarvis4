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
          // TODO: Once we have database persistence, use lastReadwiseFetch to only fetch new highlights
          // For now, always fetch from last 30 days since database is in-memory and gets cleared on reload
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const lastFetch = thirtyDaysAgo.toISOString();

          // Fetch highlights
          progress.report({ message: 'Downloading from Readwise (last 30 days)...' });
          const highlightData = await readwise.fetchAllHighlightsWithBooks(lastFetch);

          // Store highlights in webview manager
          webview.setHighlights(highlightData);

          // Track new highlights in database
          progress.report({ message: 'Processing highlights...' });
          let newCount = 0;
          for (const item of highlightData) {
            const highlightId = String(item.highlight.id);
            const existingState = db.getHighlightState(highlightId);
            if (!existingState) {
              db.trackHighlight(highlightId);
              newCount++;
            }
          }

          // Don't update lastReadwiseFetch until we have database persistence
          // Otherwise second fetch will get 0 results since database was cleared on reload

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
