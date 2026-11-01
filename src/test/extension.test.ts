import * as assert from 'assert';
import * as vscode from 'vscode';
import { MCPClient } from '../transport/MCPTransport';
import { MCPInspectorPanel } from '../views/Inspector';

suite('Extension Test Suite', () => {
	test('activates and registers the inspector command', async () => {
		const extension = vscode.extensions.getExtension('DhananjaySenday.mcp--inspector');
		assert.ok(extension, 'MCP Inspector extension was not found');

		await extension.activate();
		assert.ok(extension.isActive, 'MCP Inspector did not activate');

		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('mcp--inspector.createNewRequest'),
			'createNewRequest command was not registered',
		);
	});

	test('createOrShow reuses the existing panel', () => {
		const extensionUri = vscode.Uri.file(__dirname);

		MCPInspectorPanel.createOrShow(extensionUri);
		const firstPanel = MCPInspectorPanel.currentPanel;
		assert.ok(firstPanel, 'the inspector panel was not created');

		MCPInspectorPanel.createOrShow(extensionUri);
		assert.strictEqual(MCPInspectorPanel.currentPanel, firstPanel);
	});

	test('connection handlers report failures for invalid input', async () => {
		const extensionUri = vscode.Uri.file(__dirname);
		MCPInspectorPanel.createOrShow(extensionUri);
		const panel = MCPInspectorPanel.currentPanel;
		assert.ok(panel, 'the inspector panel was not created');

		const handlers = panel as unknown as {
			handleSSEConnection(data: unknown): Promise<void>;
			handleStreamableHTTPConnection(data: unknown): Promise<void>;
			handleMCPDisconnect(): Promise<void>;
		};

		await handlers.handleSSEConnection({ serverUrl: 'not-a-url', headers: {} });
		await handlers.handleStreamableHTTPConnection({ serverUrl: 'not-a-url', headers: {} });
		await handlers.handleMCPDisconnect();
	});

	test('client rejects invalid URLs before opening a connection', async () => {
		const client = new MCPClient();

		const sse = await client.connectToSSE('not-a-url');
		assert.strictEqual(sse.success, false);

		const streamableHttp = await client.connectToStreamableHTTP('ftp://example.com');
		assert.strictEqual(streamableHttp.success, false);

		const tool = await client.executeTool('missingTool', {});
		assert.strictEqual(tool.success, false);
		assert.strictEqual(tool.error, 'Not connected to any transport');

		await client.disconnect();
	});
});
