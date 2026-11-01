import * as vscode from 'vscode';
import { MCPClient } from '../transport/MCPTransport';

const RELAY_BASE_URL = 'https://mcp-relay.dhananjaay.dev';

export class MCPInspectorPanel {
	public static currentPanel: MCPInspectorPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
    private _mcpClient: MCPClient | null = null;
    private readonly _isWeb: boolean;

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._isWeb = vscode.env.uiKind === vscode.UIKind.Web;

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
						} else if (connectionData.transport === 'streamable-http') {
							await this.handleStreamableHTTPConnection(connectionData);
						}
                        break;
                    case 'disconnect':
						await this.handleMCPDisconnect();
                        break;
                    case 'executeTool':
                        await this.handleToolExecution(message.data.toolName, message.data.args);
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
		const relayPrompt = this._isWeb
			? `
					<div id="relayPrompt" class="relay-prompt" style="display: none;">
						<div class="relay-title">Connection failed. Use relay server to connect?</div>
						<div id="relayErrorMessage" class="relay-error"></div>
						<div class="form-group">
							<label for="relayServer">Relay server (read-only):</label>
							<input type="text" id="relayServer" value="${RELAY_BASE_URL}" readonly>
						</div>
						<div class="relay-actions">
							<button onclick="connectViaRelay()">Use relay</button>
							<button class="secondary" onclick="hideRelayPrompt()">Cancel</button>
						</div>
					</div>`
			: '';

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
					.web-note {
						padding: 10px;
						margin-bottom: 10px;
						border-left: 3px solid var(--vscode-inputValidation-warningBorder);
						background: var(--vscode-inputValidation-warningBackground);
						color: var(--vscode-inputValidation-warningForeground);
						border-radius: 3px;
						font-size: 12px;
					}
					.relay-prompt {
						margin-top: 15px;
						padding: 12px;
						border: 1px solid var(--vscode-inputValidation-errorBorder);
						background: var(--vscode-inputValidation-errorBackground);
						border-radius: 3px;
					}
					.relay-title {
						font-weight: 600;
						margin-bottom: 6px;
					}
					.relay-error {
						font-size: 12px;
						margin-bottom: 10px;
						color: var(--vscode-errorForeground);
					}
					.relay-actions {
						display: flex;
						gap: 8px;
					}
					.relay-actions button {
						width: auto;
						margin-top: 0;
					}
					button.secondary {
						background: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
					}
					input[readonly] {
						opacity: 0.8;
						cursor: text;
					}
					.hint {
						color: var(--vscode-descriptionForeground);
						font-size: 12px;
						margin-top: -4px;
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
					.tool-container {
						display: flex;
						align-items: center;
						margin-bottom: 10px;
						gap: 10px;
					}
					.tool-item {
						flex: 1;
						padding: 10px;
						border: 1px solid var(--vscode-input-border);
						border-radius: 3px;
						cursor: pointer;
					}
					.tool-button {
						width: 80px;
						height: 36px;
						margin: 0;
					}
					/* Modal styles */
					.modal {
						display: none;
						position: fixed;
						top: 0;
						left: 0;
						width: 100%;
						height: 100%;
						background-color: rgba(0, 0, 0, 0.5);
						z-index: 1000;
						overflow-y: auto;
						padding: 20px;
					}
					.modal-content {
						position: relative;
						background-color: var(--vscode-editor-background);
						margin: 5% auto;
						padding: 20px;
						border: 1px solid var(--vscode-input-border);
						width: 90%;
						max-width: 600px;
						border-radius: 5px;
						max-height: 80vh;
						overflow-y: auto;
					}
					.modal-body {
						max-height: calc(80vh - 150px);
						overflow-y: auto;
						padding-right: 10px;
					}
					.modal-body::-webkit-scrollbar {
						width: 8px;
					}
					.modal-body::-webkit-scrollbar-track {
						background: var(--vscode-scrollbarSlider-background);
						border-radius: 4px;
					}
					.modal-body::-webkit-scrollbar-thumb {
						background: var(--vscode-scrollbarSlider-hoverBackground);
						border-radius: 4px;
					}
					.modal-body::-webkit-scrollbar-thumb:hover {
						background: var(--vscode-scrollbarSlider-activeBackground);
					}
					.close {
						position: absolute;
						right: 10px;
						top: 5px;
						font-size: 20px;
						cursor: pointer;
					}
					.required-field {
						color: #ff4444;
					}
					.modal-buttons {
						display: flex;
						justify-content: flex-end;
						gap: 10px;
						margin-top: 20px;
					}
					.modal-buttons button {
						width: auto;
						margin: 0;
					}
					.response-viewer {
						margin-top: 20px;
						padding: 10px;
						background-color: var(--vscode-input-background);
						border-radius: 3px;
						max-height: 200px;
						overflow: auto;
						display: none;
					}
					pre {
						margin: 0;
						white-space: pre-wrap;
					}
					.header-row {
						display: flex;
						gap: 8px;
						margin-bottom: 8px;
						align-items: center;
					}
					.header-row input {
						margin-bottom: 0;
						flex: 1;
					}
					.header-row .remove-btn {
						width: 32px;
						min-width: 32px;
						padding: 4px;
						margin: 0;
						flex: none;
					}
					.add-header-btn {
						width: auto;
						margin-top: 4px;
						padding: 4px 12px;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<h2>MCP Inspector</h2>
					<div class="form-group">
						<label for="transportType">Transport Type:</label>
						<select id="transportType" onchange="handleTransportChange()">
							<option value="stdio" ${this._isWeb ? 'disabled' : 'selected'}>STDIO${this._isWeb ? ' (not available on the web)' : ''}</option>
							<option value="sse" ${this._isWeb ? 'selected' : ''}>SSE</option>
							<option value="streamable-http">Streamable HTTP</option>
						</select>
					</div>

					<!-- STDIO Section -->
					<div id="stdioSection" class="transport-section ${this._isWeb ? '' : 'active'}">
						${this._isWeb ? '<div class="web-note">STDIO is not available in VS Code for the Web. Use the desktop app or Codespaces, or connect to a remote SSE server.</div>' : ''}
						<div class="form-group">
							<label for="command">Server Script Path:</label>
							<input type="text" id="command" placeholder="Enter path to server script (.js or .py)">
						</div>
						<div class="form-group">
							<label for="scriptArgs">Script Arguments:</label>
							<input type="text" id="scriptArgs" placeholder="Enter script arguments (optional)">
						</div>
					</div>

					<!-- SSE Section -->
					<div id="sseSection" class="transport-section ${this._isWeb ? 'active' : ''}">
						<div class="form-group">
							<label for="serverUrl">Server URL:</label>
							<input type="text" id="serverUrl" placeholder="Enter SSE server URL">
						</div>
						<div class="form-group">
							<label>Headers:</label>
							<div id="headersList"></div>
							<button type="button" class="add-header-btn" onclick="addHeader('sse')">+ Add header</button>
							<p class="hint">Sent with every request, for example <code>Authorization: Bearer &lt;token&gt;</code>.</p>
						</div>
					</div>

					<!-- Streamable HTTP Section -->
					<div id="streamableHttpSection" class="transport-section">
						<div class="form-group">
							<label for="streamableHttpUrl">Server URL:</label>
							<input type="text" id="streamableHttpUrl" placeholder="Enter Streamable HTTP server URL (for example https://host/mcp)">
						</div>
						<div class="form-group">
							<label>Headers:</label>
							<div id="streamableHttpHeadersList"></div>
							<button type="button" class="add-header-btn" onclick="addHeader('streamable-http')">+ Add header</button>
							<p class="hint">Sent with every request, for example <code>Authorization: Bearer &lt;token&gt;</code>.</p>
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
					${relayPrompt}

					<div id="toolsContainer" class="tools-container">
						<h3>Available Tools:</h3>
						<div id="toolsList"></div>
					</div>
				</div>

				<!-- Tool Execution Modal -->
				<div id="toolModal" class="modal">
					<div class="modal-content">
						<span class="close" onclick="closeModal()">&times;</span>
						<h3 id="modalTitle">Execute Tool</h3>
						<div class="modal-body">
							<form id="toolForm">
								<div id="toolFields"></div>
								<div class="modal-buttons">
									<button type="button" onclick="closeModal()">Cancel</button>
									<button type="submit">Execute</button>
								</div>
							</form>
							<div id="responseViewer" class="response-viewer">
								<pre id="responseContent"></pre>
							</div>
						</div>
					</div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const isWeb = ${this._isWeb};
					let isConnected = false;
					let relayAttempted = false;
					let lastTransport = 'sse';

					function handleTransportChange() {
						const transportType = document.getElementById('transportType').value;
						document.getElementById('stdioSection').classList.toggle('active', transportType === 'stdio');
						document.getElementById('sseSection').classList.toggle('active', transportType === 'sse');
						document.getElementById('streamableHttpSection').classList.toggle('active', transportType === 'streamable-http');
					}

					function addHeader(section = 'sse', key = '', value = '') {
						const listId = section === 'streamable-http' ? 'streamableHttpHeadersList' : 'headersList';
						const list = document.getElementById(listId);
						const row = document.createElement('div');
						row.className = 'header-row';

						const keyInput = document.createElement('input');
						keyInput.type = 'text';
						keyInput.placeholder = 'Header name';
						keyInput.value = key;

						const valueInput = document.createElement('input');
						valueInput.type = 'text';
						valueInput.placeholder = 'Header value';
						valueInput.value = value;

						const removeButton = document.createElement('button');
						removeButton.type = 'button';
						removeButton.className = 'remove-btn';
						removeButton.title = 'Remove header';
						removeButton.textContent = '✕';
						removeButton.addEventListener('click', () => row.remove());

						row.append(keyInput, valueInput, removeButton);
						list.appendChild(row);
					}

					function getHeaders(section = 'sse') {
						const listId = section === 'streamable-http' ? 'streamableHttpHeadersList' : 'headersList';
						const rows = document.getElementById(listId).querySelectorAll('.header-row');
						const headers = {};
						rows.forEach(row => {
							const inputs = row.querySelectorAll('input');
							const key = inputs[0].value.trim();
							if (key) {
								headers[key] = inputs[1].value;
							}
						});
						return headers;
					}

					function hideRelayPrompt() {
						const prompt = document.getElementById('relayPrompt');
						if (prompt) {
							prompt.style.display = 'none';
						}
					}

					function getServerUrlFor(transportType) {
						return transportType === 'streamable-http'
							? document.getElementById('streamableHttpUrl').value.trim()
							: document.getElementById('serverUrl').value.trim();
					}

					function connectViaRelay() {
						const transportType = lastTransport === 'streamable-http' ? 'streamable-http' : 'sse';
						const upstream = getServerUrlFor(transportType);
						const relayBase = document.getElementById('relayServer').value.replace(/\\/+$/, '');
						if (!upstream) {
							return;
						}
						relayAttempted = true;
						hideRelayPrompt();
						document.getElementById('status').textContent = 'Connecting through the relay...';
						const relayPath = transportType === 'streamable-http' ? '/mcp?url=' : '/sse?url=';
						vscode.postMessage({
							command: 'connect',
							data: {
								transport: transportType,
								serverUrl: relayBase + relayPath + encodeURIComponent(upstream),
								headers: getHeaders(transportType)
							}
						});
					}

					function connect() {
						if (isConnected) {
							disconnect();
							return;
						}

						const transportType = document.getElementById('transportType').value;
						let connectionData = {};

						lastTransport = transportType;
						relayAttempted = false;
						hideRelayPrompt();

						if (isWeb && transportType === 'stdio') {
							document.getElementById('status').textContent = 'STDIO is not available in VS Code for the Web.';
							return;
						}

						if (transportType === 'stdio') {
							const command = document.getElementById('command').value;
							const args = document.getElementById('scriptArgs').value;
							connectionData = {
								transport: 'stdio',
								command: command,
								args: args
							};
						} else if (transportType === 'sse') {
							const serverUrl = getServerUrlFor('sse');
							if (!serverUrl) {
								document.getElementById('status').textContent = 'Enter an SSE server URL.';
								return;
							}
							connectionData = {
								transport: 'sse',
								serverUrl,
								headers: getHeaders('sse')
							};
						} else {
							const serverUrl = getServerUrlFor('streamable-http');
							if (!serverUrl) {
								document.getElementById('status').textContent = 'Enter a Streamable HTTP server URL.';
								return;
							}
							connectionData = {
								transport: 'streamable-http',
								serverUrl,
								headers: getHeaders('streamable-http')
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
						toolsList.innerHTML = tools.map(tool => {
							const schemaString = encodeURIComponent(JSON.stringify({
								properties: tool.input_schema?.properties || {},
								required: tool.input_schema?.required || []
							}));

							return \`
								<div class="tool-container">
									<div class="tool-item">
										<strong>\${tool.name}</strong>
										<p>\${tool.description || ''}</p>
									</div>
									<button class="tool-button" onclick="showToolModal('\${tool.name}', '\${schemaString}')">RUN</button>
								</div>
							\`;
						}).join('');
					}

					// Handle messages from the extension
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'connectionStatus':
								if (message.data.disconnected) {
									updateConnectionUI(false);
									hideRelayPrompt();
								} else if (message.data.success) {
									updateConnectionUI(true);
									hideRelayPrompt();
									if (message.data.tools) {
										displayTools(message.data.tools);
									}
								} else {
									updateConnectionUI(false);
									const error = message.data.error || 'Unknown error';
									document.getElementById('status').textContent = 'Connection failed: ' + error;

									const serverUrl = getServerUrlFor(lastTransport);
									const relayBase = document.getElementById('relayServer')?.value || '';
									const alreadyRelay = relayBase && serverUrl.startsWith(relayBase);
									if (isWeb && message.data.corsLikely && !relayAttempted && !alreadyRelay) {
										document.getElementById('relayErrorMessage').textContent = error;
										document.getElementById('relayPrompt').style.display = 'block';
									}
								}
								break;
						}
					});

					function showToolModal(toolName, schemaString) {
						const modal = document.getElementById('toolModal');
						const modalTitle = document.getElementById('modalTitle');
						const toolFields = document.getElementById('toolFields');
						const responseViewer = document.getElementById('responseViewer');
						const responseContent = document.getElementById('responseContent');

						// Reset the form and response viewer
						toolFields.innerHTML = '';
						responseViewer.style.display = 'none';
						responseContent.textContent = '';

						// Parse the schema
						const schema = JSON.parse(decodeURIComponent(schemaString));
						modalTitle.textContent = \`Execute \${toolName}\`;

						// Create form fields based on schema
						Object.entries(schema.properties).forEach(([key, value]) => {
							const isRequired = schema.required.includes(key);
							const fieldContainer = document.createElement('div');
							fieldContainer.className = 'form-group';

							const label = document.createElement('label');
							label.htmlFor = key;
							label.innerHTML = \`\${key}\${isRequired ? ' <span class="required-field">*</span>' : ''}\`;
							
							const input = document.createElement('input');
							input.type = 'text';
							input.id = key;
							input.name = key;
							input.required = isRequired;

							fieldContainer.appendChild(label);
							fieldContainer.appendChild(input);
							toolFields.appendChild(fieldContainer);
						});

						// Handle form submission
						const form = document.getElementById('toolForm');
						form.onsubmit = async (e) => {
							e.preventDefault();
							const formData = new FormData(form);
							const args = {};
							formData.forEach((value, key) => {
								if (value) args[key] = value;
							});

							vscode.postMessage({
								command: 'executeTool',
								data: {
									toolName: toolName,
									args: args
								}
							});
						};

						modal.style.display = 'block';
					}

					function closeModal() {
						const modal = document.getElementById('toolModal');
						modal.style.display = 'none';
					}

					// Close modal when clicking outside
					window.onclick = function(event) {
						const modal = document.getElementById('toolModal');
						if (event.target === modal) {
							closeModal();
						}
					}

					// Handle tool execution response
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'toolExecutionResponse':
								const responseViewer = document.getElementById('responseViewer');
								const responseContent = document.getElementById('responseContent');
								responseViewer.style.display = 'block';
								responseContent.textContent = JSON.stringify(message.data, null, 2);
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

			const serverScriptPath = connectionData.command;
			const scriptArgs = connectionData.args || '';

			
			// Connect to the server using STDIO
			const result = await this._mcpClient.connectToStdio(serverScriptPath, scriptArgs);

			
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

			// Get the server URL and optional headers
			const serverUrl = connectionData.serverUrl;
			const headers: Record<string, string> | undefined =
				connectionData.headers && Object.keys(connectionData.headers).length > 0
					? connectionData.headers
					: undefined;

			// Connect to the server using SSE
			const result = await this._mcpClient.connectToSSE(serverUrl, headers);
			
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
						error: result.error,
						corsLikely: result.corsLikely
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


	private async handleStreamableHTTPConnection(connectionData: any) {
		try {
			// Create a new MCP client for this session
			this._mcpClient = new MCPClient();

			const serverUrl = connectionData.serverUrl;
			const headers: Record<string, string> | undefined =
				connectionData.headers && Object.keys(connectionData.headers).length > 0
					? connectionData.headers
					: undefined;

			const result = await this._mcpClient.connectToStreamableHTTP(serverUrl, headers);

			if (result.success) {
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: true,
						tools: result.tools
					}
				});
			} else {
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: false,
						error: result.error,
						corsLikely: result.corsLikely
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

	private async handleToolExecution(toolName: string, args: Record<string, any>) {
		try {
			if (!this._mcpClient) {
				throw new Error('Not connected to MCP server');
			}

			const result = await this._mcpClient.executeTool(toolName, args);
			
			this._panel.webview.postMessage({
				command: 'toolExecutionResponse',
				data: result
			});
		} catch (error) {
			this._panel.webview.postMessage({
				command: 'toolExecutionResponse',
				data: {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error occurred'
				}
			});
		}
	}
}