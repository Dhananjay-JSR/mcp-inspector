import * as vscode from 'vscode';
import { McpInspectorViewProvider } from './views/Sidebar';
import { MCPInspectorPanel } from './views/Inspector';

export function activate(context: vscode.ExtensionContext) {
	const viewId ="mcp--inspector.inspector-view";
	const sidebarProvider = new McpInspectorViewProvider();
	const viewRegisterer = vscode.window.registerWebviewViewProvider(
		viewId,
		sidebarProvider
	);
	context.subscriptions.push(viewRegisterer);
	const createNewRequestCommand = vscode.commands.registerCommand('mcp--inspector.createNewRequest', () => {
		MCPInspectorPanel.createOrShow(context.extensionUri);
	});
	context.subscriptions.push(createNewRequestCommand);


}

export function deactivate() {}
