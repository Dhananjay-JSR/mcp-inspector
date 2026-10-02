import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { activate, deactivate } from '../extension';
import { McpInspectorViewProvider } from '../views/Sidebar';
import { MCPInspectorPanel } from '../views/Inspector';
import { MCPClient } from '../transport/MCPTransport';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('activate registers the webview provider and command', () => {
		const subscriptions: vscode.Disposable[] = [];
		const context = {
			subscriptions,
			extensionUri: vscode.Uri.file(__dirname),
		} as unknown as vscode.ExtensionContext;

		activate(context);

		assert.strictEqual(subscriptions.length, 2);
		deactivate();
	});

	test('McpInspectorViewProvider renders HTML and handles webview messages', async () => {
		const provider = new McpInspectorViewProvider();
		let messageHandler: (message: { command: string }) => unknown = () => undefined;

		const fakeWebviewView = {
			webview: {
				options: {},
				html: '',
				onDidReceiveMessage: (callback: (message: { command: string }) => unknown) => {
					messageHandler = callback;
					return { dispose: () => undefined };
				},
			},
		} as unknown as vscode.WebviewView;

		provider.resolveWebviewView(fakeWebviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

		assert.ok((fakeWebviewView.webview.html as unknown as string).includes('MCP Inspector'));

		// Known command: forwards to the registered extension command.
		await messageHandler({ command: 'createNewRequest' });
		// Unknown command: should be silently ignored.
		await messageHandler({ command: 'unknown' });
	});

	test('MCPInspectorPanel createOrShow reuses the existing panel', () => {
		const extensionUri = vscode.Uri.file(__dirname);

		MCPInspectorPanel.createOrShow(extensionUri);
		const firstPanel = MCPInspectorPanel.currentPanel;
		assert.ok(firstPanel);

		MCPInspectorPanel.createOrShow(extensionUri);
		assert.strictEqual(MCPInspectorPanel.currentPanel, firstPanel);
	});

	test('MCPInspectorPanel connection handlers report failures gracefully', async () => {
		const panel = MCPInspectorPanel.currentPanel as unknown as {
			handleSSEConnection(data: unknown): Promise<void>;
			handleStreamableHTTPConnection(data: unknown): Promise<void>;
			handleToolExecution(toolName: string, args: Record<string, unknown>): Promise<void>;
			handleMCPDisconnect(): Promise<void>;
			dispose(): void;
		};
		assert.ok(panel);

		await panel.handleSSEConnection({ serverUrl: 'not-a-url', headers: {} });
		await panel.handleStreamableHTTPConnection({ serverUrl: 'not-a-url', headers: {} });
		await panel.handleToolExecution('someTool', {});
		await panel.handleMCPDisconnect();

		panel.dispose();
		assert.strictEqual(MCPInspectorPanel.currentPanel, undefined);
	});

	test('MCPClient reports connection failures for invalid input', async () => {
		const client = new MCPClient();

		const sseResult = await client.connectToSSE('not-a-url');
		assert.strictEqual(sseResult.success, false);

		const httpResult = await client.connectToStreamableHTTP('ftp://example.com');
		assert.strictEqual(httpResult.success, false);

		const toolResult = await client.executeTool('missingTool', {});
		assert.strictEqual(toolResult.success, false);

		await client.disconnect();
	});
});
