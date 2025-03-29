import * as vscode from 'vscode';
import { MCPClient } from '../transport/MCPTransport';

export class MCPInspectorPanel {
	public static currentPanel: MCPInspectorPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
    private _mcpClient: MCPClient | null = null;

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;

		this._panel.webview.html = this._getRenderer(this._panel.webview);

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'connect':
						const connectionData = message.data;
						if (connectionData.transport === 'stdio') {
							await this.handleStdioConnection(connectionData);
						} else if (connectionData.transport === 'sse') {
							await this.handleSSEConnection(connectionData);
						}
                        break;
                        case 'disconnect':
						await this.handleMCPDisconnect();
                        break;

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
					.tools-container {
						margin-top: 20px;
						display: none;
					}
					.tools-container.visible {
						display: block;
					}
					.tool-item {
						padding: 10px;
						border: 1px solid var(--vscode-input-border);
						margin-bottom: 10px;
						border-radius: 3px;
						cursor: pointer;
					}
					.tool-item:hover {
						background-color: var(--vscode-list-hoverBackground);
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
							<label for="command">Server Script Path:</label>
							<input type="text" id="command" placeholder="Enter path to server script (.js or .py)">
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

					<div id="toolsContainer" class="tools-container">
						<h3>Available Tools:</h3>
						<div id="toolsList"></div>
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
						if (isConnected) {
							disconnect();
							return;
						}

						const transportType = document.getElementById('transportType').value;
						let connectionData = {};

						if (transportType === 'stdio') {
							connectionData = {
								transport: 'stdio',
								command: document.getElementById('command').value
							};
						} else {
							connectionData = {
								transport: 'sse',
								serverUrl: document.getElementById('serverUrl').value
							};
						}

						// Send connection data to extension
						vscode.postMessage({
							command: 'connect',
							data: connectionData
						});
					}

					function disconnect() {
						vscode.postMessage({
							command: 'disconnect'
						});
					}

					function updateConnectionUI(connected) {
						const statusIndicator = document.getElementById('statusIndicator');
						const connectButtonText = document.getElementById('connectButtonText');
						const status = document.getElementById('status');
						const toolsContainer = document.getElementById('toolsContainer');

						isConnected = connected;

						if (connected) {
							statusIndicator.className = 'status-indicator status-connected';
							connectButtonText.textContent = 'Disconnect';
							status.textContent = 'Connected';
							toolsContainer.classList.add('visible');
						} else {
							statusIndicator.className = 'status-indicator status-disconnected';
							connectButtonText.textContent = 'Connect';
							status.textContent = 'Disconnected';
							toolsContainer.classList.remove('visible');
						}
					}

					function displayTools(tools) {
						const toolsList = document.getElementById('toolsList');
						toolsList.innerHTML = tools.map(tool => \`
							<div class="tool-item">
								<strong>\${tool.name}</strong>
								<p>\${tool.description}</p>
							</div>
						\`).join('');
					}

					// Handle messages from the extension
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'connectionStatus':
								if (message.data.disconnected) {
									updateConnectionUI(false);
								} else if (message.data.success) {
									updateConnectionUI(true);
									if (message.data.tools) {
										displayTools(message.data.tools);
									}
								} else {
									updateConnectionUI(false);
									document.getElementById('status').textContent = 'Connection failed: ' + message.data.error;
								}
								break;
						}
					});
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

    private async handleStdioConnection(connectionData: any) {
		try {
			// Create a new MCP client for this session
			this._mcpClient = new MCPClient();

			// Get the server script path from the command
			const serverScriptPath = connectionData.command;
			
			// Connect to the server using STDIO
			const result = await this._mcpClient.connectToStdio(serverScriptPath);
			
			if (result.success) {
				// Send success message back to webview
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: true,
						tools: result.tools
					}
				});
			} else {
				// Send error message back to webview
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: false,
						error: result.error
					}
				});
			}
		} catch (error) {
			this._panel.webview.postMessage({
				command: 'connectionStatus',
				data: {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error occurred'
				}
			});
		}
	}

	private async handleSSEConnection(connectionData: any) {
		try {
			// Create a new MCP client for this session
			this._mcpClient = new MCPClient();

			// Get the server URL
			const serverUrl = connectionData.serverUrl;
			
			// Connect to the server using SSE
			const result = await this._mcpClient.connectToSSE(serverUrl);
			
			if (result.success) {
				// Send success message back to webview
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: true,
						tools: result.tools
					}
				});
			} else {
				// Send error message back to webview
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: false,
						error: result.error
					}
				});
			}
		} catch (error) {
			this._panel.webview.postMessage({
				command: 'connectionStatus',
				data: {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error occurred'
				}
			});
		}
	}


    private async handleMCPDisconnect(){
        if (this._mcpClient) {
			await this._mcpClient.disconnect();
			this._mcpClient = null;
			
			// Send disconnect status to webview
			this._panel.webview.postMessage({
				command: 'connectionStatus',
				data: {
					success: true,
					disconnected: true
				}
			});
		}
    }
}