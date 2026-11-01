import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { MCPClient } from '../transport/MCPTransport';
import { MCPInspectorPanel } from '../views/Inspector';

const fixtureServer = path.resolve(__dirname, '../../src/test/fixtures/echo-server.cjs');
// The extension host is Electron, so process.execPath is not a Node CLI.
const nodeCommand = 'node';

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
			handleRemoteConnection(data: unknown): Promise<void>;
			handleMCPDisconnect(): Promise<void>;
		};

		await handlers.handleRemoteConnection({ serverUrl: 'not-a-url', headers: {} });
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

	test('connects to a STDIO server and lists its tools', async function () {
		this.timeout(20000);
		const client = new MCPClient();

		try {
			const result = await client.connectToStdio(nodeCommand, fixtureServer);

			assert.strictEqual(result.success, true);
			assert.ok(result.tools, 'the connection should report tools');
			const names = result.tools!.map((tool) => tool.name);
			assert.ok(names.includes('echo'), `echo tool was missing from ${names.join(', ')}`);
			assert.ok(names.includes('fail'), `fail tool was missing from ${names.join(', ')}`);
		} finally {
			await client.disconnect();
		}
	});

	test('executes a tool over the connected transport', async function () {
		this.timeout(20000);
		const client = new MCPClient();

		try {
			const connection = await client.connectToStdio(nodeCommand, fixtureServer);
			assert.strictEqual(connection.success, true);

			const result = await client.executeTool('echo', {});
			assert.strictEqual(result.success, true);
			assert.ok(result.result, 'the tool should return a result');
			assert.deepStrictEqual((result.result as { content: unknown[] }).content, [
				{ type: 'text', text: 'echoed' },
			]);
		} finally {
			await client.disconnect();
		}
	});

	test('reports tool failures without losing the connection', async function () {
		this.timeout(20000);
		const client = new MCPClient();

		try {
			const connection = await client.connectToStdio(nodeCommand, fixtureServer);
			assert.strictEqual(connection.success, true);

			const result = await client.executeTool('fail', {});
			assert.ok(
				result.success === false || (result.result as { isError?: boolean }).isError === true,
				'a failing tool should be reported as an error',
			);

			const stillConnected = await client.executeTool('echo', {});
			assert.strictEqual(stillConnected.success, true);
		} finally {
			await client.disconnect();
		}
	});

	test('disconnect clears the transport so tools cannot run', async function () {
		this.timeout(20000);
		const client = new MCPClient();

		const connection = await client.connectToStdio(nodeCommand, fixtureServer);
		assert.strictEqual(connection.success, true);

		await client.disconnect();

		const result = await client.executeTool('echo', {});
		assert.strictEqual(result.success, false);
		assert.strictEqual(result.error, 'Not connected to any transport');
	});

	test('connectToStdio reports a missing command instead of throwing', async () => {
		const client = new MCPClient();
		const result = await client.connectToStdio(
			path.join(__dirname, 'does-not-exist-binary'),
			'',
		);

		assert.strictEqual(result.success, false);
		assert.ok(result.error, 'a failed STDIO connection should explain why');
	});

	test('connectToRemote reports a failure for an unreachable local server', async () => {
		const client = new MCPClient();
		const result = await client.connectToRemote('http://127.0.0.1:1/mcp', {}, undefined);

		assert.strictEqual(result.success, false);
		assert.ok(result.error, 'a failed remote connection should explain why');
	});
});
