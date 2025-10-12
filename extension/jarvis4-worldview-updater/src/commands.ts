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
      try {
        // Immediately show webview with cached DB highlights
        await webview.show();

        // Show loading indicator in webview
        webview.startLoading();

        // Then fetch new highlights in background with progress indicator
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Fetching new Readwise highlights...',
          cancellable: false
        }, async (progress) => {
          try {
            // Use persistent lastReadwiseFetch or default to 30 days ago
            const lastFetch = await db.getLastReadwiseFetch() || (() => {
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
              return thirtyDaysAgo.toISOString();
            })();

            // Fetch highlights
            progress.report({ message: 'Downloading from Readwise...' });
            const highlightData = await readwise.fetchAllHighlightsWithBooks(lastFetch);

            if (highlightData.length > 0) {
              // Sync to database
              progress.report({ message: 'Syncing to database...' });
              const books = highlightData.map(item => item.book);
              const highlights = highlightData.map(item => item.highlight);

              // Remove duplicates by user_book_id
              const uniqueBooks = books.filter((book, index, self) =>
                index === self.findIndex(b => b.user_book_id === book.user_book_id)
              );

              await db.syncHighlights(uniqueBooks, highlights);

              // Store highlights in webview manager for this session
              webview.setHighlights(highlightData);

              // Update lastReadwiseFetch now that we have persistence
              await db.setLastReadwiseFetch(new Date().toISOString());

              // Stop loading and refresh webview with new data
              webview.stopLoading();
              await webview.refresh();

              vscode.window.showInformationMessage(
                `Fetched ${highlightData.length} new highlights from Readwise`
              );
            } else {
              webview.stopLoading();
              vscode.window.showInformationMessage('No new highlights to fetch');
            }
          } catch (error) {
            webview.stopLoading();
            vscode.window.showErrorMessage(`Error fetching highlights: ${error}`);
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage(`Error showing highlights: ${error}`);
      }
    })
  );

  // Command to just show panel (without fetching)
  context.subscriptions.push(
    vscode.commands.registerCommand('readwise.showPanel', async () => {
      await webview.show();
    })
  );
}
