import * as vscode from 'vscode';
import * as path from 'path';
import { HighlightDatabase } from './database';
import { ReadwiseClient } from './readwiseClient';
import { WebviewManager } from './webview';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
	try {
		console.log('Activating Jarvis4 Worldview Updater extension...');

		// Initialize database (workspace-specific with fallback)
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const dbPath = workspaceFolder
			? path.join(workspaceFolder.uri.fsPath, 'db', 'readwise-highlights.db')
			: path.join(context.globalStorageUri.fsPath, 'readwise-highlights.db');

		console.log('Database path:', dbPath);

		const db = new HighlightDatabase(dbPath);
		db.initialize();

		// Get API token from configuration
		const config = vscode.workspace.getConfiguration('readwise');
		const apiToken = config.get<string>('apiToken');

		if (!apiToken) {
			vscode.window.showWarningMessage(
				'Readwise API token not configured. Please set readwise.apiToken in your settings.',
				'Open Settings'
			).then(selection => {
				if (selection === 'Open Settings') {
					vscode.commands.executeCommand('workbench.action.openSettings', 'readwise.apiToken');
				}
			});
		}

		// Initialize Readwise client
		const readwise = new ReadwiseClient(apiToken || '');

		// Initialize webview manager
		const webviewManager = new WebviewManager(context, db);

		// Register commands
		registerCommands(context, db, readwise, webviewManager);

		// Store in context for cleanup
		context.subscriptions.push({
			dispose: () => db.dispose()
		});

		console.log('Jarvis4 Worldview Updater extension activated successfully');
	} catch (error) {
		console.error('Failed to activate Jarvis4 Worldview Updater:', error);
		vscode.window.showErrorMessage(`Failed to activate Jarvis4 Worldview Updater: ${error}`);
		throw error;
	}
}

export function deactivate() {
	console.log('Jarvis4 Worldview Updater extension deactivated');
}
