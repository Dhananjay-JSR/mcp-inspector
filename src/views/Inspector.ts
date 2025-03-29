import * as vscode from 'vscode';

export class MCPInspectorPanel {
	public static currentPanel: MCPInspectorPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;

		this._panel.webview.html = this._getRenderer(this._panel.webview);

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'connect':
						const connectionData = message.data;
						if (connectionData.transport === 'stdio') {
							console.log('STDIO Connection:', connectionData);
							// TODO: Implement STDIO connection logic
						} else if (connectionData.transport === 'sse') {
							console.log('SSE Connection:', connectionData);
							// TODO: Implement SSE connection logic
						}
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (MCPInspectorPanel.currentPanel) {
			MCPInspectorPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			'mcpInspector',
			'MCP Inspector',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [extensionUri]
			}
		);

		MCPInspectorPanel.currentPanel = new MCPInspectorPanel(panel, extensionUri);
	}

	private _getRenderer(webview: vscode.Webview) {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>MCP Inspector</title>
				<style>
					body {
						padding: 20px;
						color: var(--vscode-editor-foreground);
						background-color: var(--vscode-editor-background);
						font-family: var(--vscode-font-family);
					}
					.container {
						max-width: 800px;
						margin: 0 auto;
					}
					.form-group {
						margin-bottom: 15px;
					}
					label {
						display: block;
						margin-bottom: 5px;
						color: var(--vscode-input-foreground);
					}
					input, select, textarea {
						width: 100%;
						padding: 8px;
						margin-bottom: 10px;
						background-color: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						border: 1px solid var(--vscode-input-border);
						border-radius: 3px;
					}
					button {
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						padding: 8px 16px;
						cursor: pointer;
						border-radius: 3px;
						width: 100%;
						margin-top: 10px;
					}
					button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
					.response-container {
						margin-top: 20px;
						padding: 10px;
						border: 1px solid var(--vscode-input-border);
						border-radius: 3px;
						background-color: var(--vscode-editor-background);
					}
					.transport-section {
						display: none;
					}
					.transport-section.active {
						display: block;
					}
					.status-indicator {
						width: 10px;
						height: 10px;
						border-radius: 50%;
						display: inline-block;
						margin-right: 5px;
					}
					.status-disconnected {
						background-color: #ff4444;
					}
					.status-connected {
						background-color: #00C851;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<h2>MCP Inspector</h2>
					<div class="form-group">
						<label for="transportType">Transport Type:</label>
						<select id="transportType" onchange="handleTransportChange()">
							<option value="stdio">STDIO</option>
							<option value="sse">SSE</option>
						</select>
					</div>

					<!-- STDIO Section -->
					<div id="stdioSection" class="transport-section active">
						<div class="form-group">
							<label for="command">Command:</label>
							<input type="text" id="command" placeholder="Enter command">
						</div>
						<div class="form-group">
							<label for="arguments">Arguments:</label>
							<textarea id="arguments" rows="3" placeholder="Enter command arguments"></textarea>
						</div>
					</div>

					<!-- SSE Section -->
					<div id="sseSection" class="transport-section">
						<div class="form-group">
							<label for="serverUrl">Server URL:</label>
							<input type="text" id="serverUrl" placeholder="Enter SSE server URL">
						</div>
					</div>

					<div class="form-group">
						<button onclick="connect()">
							<span id="statusIndicator" class="status-indicator status-disconnected"></span>
							<span id="connectButtonText">Connect</span>
						</button>
					</div>

					<div class="response-container">
						<h3>Connection Status:</h3>
						<pre id="status">Not connected</pre>
					</div>
				</div>
				<script>
					const vscode = acquireVsCodeApi();
					let isConnected = false;

					function handleTransportChange() {
						const transportType = document.getElementById('transportType').value;
						document.getElementById('stdioSection').classList.toggle('active', transportType === 'stdio');
						document.getElementById('sseSection').classList.toggle('active', transportType === 'sse');
					}

					function connect() {
						const transportType = document.getElementById('transportType').value;
						let connectionData = {};

						if (transportType === 'stdio') {
							connectionData = {
								transport: 'stdio',
								command: document.getElementById('command').value,
								arguments: document.getElementById('arguments').value
							};
						} else {
							connectionData = {
								transport: 'sse',
								serverUrl: document.getElementById('serverUrl').value
							};
						}

						// Toggle connection state
						isConnected = !isConnected;
						updateConnectionUI();

						// Send connection data to extension
						vscode.postMessage({
							command: 'connect',
							data: connectionData
						});
					}

					function updateConnectionUI() {
						const statusIndicator = document.getElementById('statusIndicator');
						const connectButtonText = document.getElementById('connectButtonText');
						const status = document.getElementById('status');

						if (isConnected) {
							statusIndicator.className = 'status-indicator status-connected';
							connectButtonText.textContent = 'Disconnect';
							status.textContent = 'Connected';
						} else {
							statusIndicator.className = 'status-indicator status-disconnected';
							connectButtonText.textContent = 'Connect';
							status.textContent = 'Disconnected';
						}
					}
				</script>
			</body>
			</html>
		`;
	}

	public dispose() {
		MCPInspectorPanel.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}