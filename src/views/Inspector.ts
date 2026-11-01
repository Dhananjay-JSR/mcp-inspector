import * as vscode from 'vscode';
import { MCPClient } from '../transport/MCPTransport';

const RELAY_BASE_URL = 'https://mcp-relay.dhananjaay.dev';
const RELAY_REPO_URL = 'https://github.com/Dhananjay-JSR/mcp-inspector-relay';

export class MCPInspectorPanel {
	public static currentPanel: MCPInspectorPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
    private _mcpClient: MCPClient | null = null;
    private readonly _isWeb: boolean;
    private readonly _secrets?: vscode.SecretStorage;

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		secrets?: vscode.SecretStorage,
	) {
		this._panel = panel;
		this._isWeb = vscode.env.uiKind === vscode.UIKind.Web;
		this._secrets = secrets;

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
						} else if (connectionData.transport === 'remote') {
							await this.handleRemoteConnection(connectionData);
						}
                        break;
                    case 'disconnect':
						await this.handleMCPDisconnect();
                        break;
                    case 'executeTool':
                        await this.handleToolExecution(message.data.toolName, message.data.args);
                        break;
                    case 'pickCommand':
                        await this.handlePickCommand();
                        break;
                    case 'openRelayRepo':
                        await vscode.env.openExternal(vscode.Uri.parse(RELAY_REPO_URL));
                        break;
				}
			},
			null,
			this._disposables
		);
	}

	public static createOrShow(extensionUri: vscode.Uri, secrets?: vscode.SecretStorage) {
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
				// Keep the typed URLs, headers, and tool list in memory when the
				// panel is hidden. Secrets are deliberately never written to
				// webview state, so this is what preserves them across tab switches.
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		MCPInspectorPanel.currentPanel = new MCPInspectorPanel(panel, extensionUri, secrets);
	}

	private _getRenderer(webview: vscode.Webview) {
		const relayPrompt = this._isWeb
			? `
					<div id="relayPrompt" class="callout" style="display: none;" role="alert">
						<div class="callout-title">Use the relay to connect</div>
						<p class="callout-body">This server does not allow requests from the editor, so the browser blocked the connection. The relay forwards the request for you.</p>
						<p class="callout-privacy">The relay does not log requests, headers, or tokens.</p>
						<p class="callout-meta"><code>${RELAY_BASE_URL.replace('https://', '')}</code> · <a href="#" onclick="openRelayRepo(); return false;">source on GitHub</a></p>
						<div class="callout-actions">
							<button onclick="connectViaRelay()">Use relay</button>
							<button class="secondary" onclick="hideRelayPrompt()">Dismiss</button>
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
						margin: 0;
						padding: 0;
						color: var(--vscode-editor-foreground);
						background-color: var(--vscode-editor-background);
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size, 13px);
						line-height: 1.5;
					}
					.container {
						max-width: 720px;
						margin: 0 auto;
						padding: 28px 20px 40px;
					}
					.page-header {
						margin-bottom: 24px;
					}
					.page-header h1 {
						margin: 0 0 4px;
						font-size: 1.25rem;
						font-weight: 600;
					}
					.page-subtitle {
						margin: 0;
						color: var(--vscode-descriptionForeground);
						font-size: 12px;
					}
					.form-group {
						margin-bottom: 16px;
					}
					.web-note {
						padding: 10px 12px;
						margin-bottom: 16px;
						border-left: 2px solid var(--vscode-inputValidation-warningBorder);
						background: var(--vscode-inputValidation-warningBackground);
						color: var(--vscode-inputValidation-warningForeground);
						border-radius: 3px;
						font-size: 12px;
					}
					.callout {
						margin-top: 12px;
						padding: 12px 14px;
						border: 1px solid var(--vscode-input-border, transparent);
						border-left: 3px solid var(--vscode-inputValidation-warningBorder);
						background: var(--vscode-editorWidget-background, var(--vscode-input-background));
						color: var(--vscode-foreground);
						border-radius: 4px;
					}
					.callout-title {
						font-weight: 600;
						margin: 0 0 4px;
					}
					.callout-body {
						margin: 0 0 8px;
						font-size: 12px;
						line-height: 1.5;
					}
					.callout-meta {
						margin: 0 0 12px;
						font-size: 11px;
						color: var(--vscode-descriptionForeground);
					}
					.callout-meta code {
						font-family: var(--vscode-editor-font-family, monospace);
					}
					.callout-meta a,
					.callout-privacy a {
						color: var(--vscode-textLink-foreground);
						text-decoration: none;
					}
					.callout-meta a:hover,
					.callout-privacy a:hover {
						color: var(--vscode-textLink-activeForeground);
						text-decoration: underline;
					}
					.callout-privacy {
						margin: 0 0 4px;
						font-size: 12px;
					}
					.callout-actions {
						display: flex;
						gap: 8px;
					}
					.callout-actions button {
						margin: 0;
					}
					.hint {
						color: var(--vscode-descriptionForeground);
						font-size: 11px;
						margin: 6px 0 0;
					}
					label {
						display: block;
						margin-bottom: 6px;
						font-size: 12px;
						color: var(--vscode-foreground);
					}
					input, select, textarea {
						width: 100%;
						height: 30px;
						box-sizing: border-box;
						padding: 4px 8px;
						margin-bottom: 0;
						background-color: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						border: 1px solid var(--vscode-input-border, transparent);
						border-radius: 3px;
						font-family: inherit;
						font-size: inherit;
						outline: none;
					}
					input:focus, select:focus, textarea:focus {
						border-color: var(--vscode-focusBorder);
					}
					button {
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: 1px solid transparent;
						padding: 6px 14px;
						cursor: pointer;
						border-radius: 3px;
						font-family: inherit;
						font-size: 12px;
						width: auto;
					}
					button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
					button:disabled {
						opacity: 0.6;
						cursor: not-allowed;
					}
					button.secondary {
						background-color: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
					}
					button.secondary:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
					}
					.button-row {
						display: flex;
						align-items: center;
						gap: 12px;
						margin: 20px 0 16px;
					}
					.button-row button {
						min-width: 120px;
					}
					.input-with-button {
						display: flex;
						gap: 8px;
					}
					.input-with-button input {
						flex: 1;
						min-width: 0;
					}
					.input-with-button button {
						flex: none;
						background-color: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
					}
					.input-with-button button:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
					}
					.transport-section {
						display: none;
					}
					.transport-section.active {
						display: block;
					}
					.status {
						display: flex;
						gap: 10px;
						align-items: flex-start;
						padding: 10px 12px;
						border: 1px solid var(--vscode-input-border, transparent);
						border-radius: 4px;
						font-size: 12px;
						line-height: 1.5;
					}
					.status.error {
						border-color: var(--vscode-inputValidation-errorBorder);
						background: var(--vscode-inputValidation-errorBackground);
					}
					.status.success {
						border-color: var(--vscode-charts-green, #3fa45b);
					}
					.status-text {
						white-space: pre-wrap;
						word-break: break-word;
					}
					.status-details {
						margin-top: 8px;
					}
					.status-details summary {
						cursor: pointer;
						color: var(--vscode-descriptionForeground);
						font-size: 11px;
					}
					.status-details pre {
						margin: 6px 0 0;
						font-size: 11px;
						opacity: 0.85;
						white-space: pre-wrap;
						word-break: break-word;
					}
					.status-indicator {
						width: 8px;
						height: 8px;
						border-radius: 50%;
						display: inline-block;
						flex: none;
						margin-top: 6px;
					}
					.status-disconnected {
						background-color: var(--vscode-descriptionForeground);
					}
					.status-connecting {
						background-color: var(--vscode-charts-yellow, #d7a700);
					}
					.status-connected {
						background-color: var(--vscode-charts-green, #00c851);
					}
					.status-error {
						background-color: var(--vscode-charts-red, #ff4444);
					}
					.tools-container {
						margin-top: 24px;
						display: none;
					}
					.tools-container.visible {
						display: block;
					}
					.tools-header {
						display: flex;
						align-items: baseline;
						justify-content: space-between;
						margin-bottom: 10px;
					}
					.tools-header h2 {
						margin: 0;
						font-size: 0.95rem;
						font-weight: 600;
					}
					.tool-count {
						color: var(--vscode-descriptionForeground);
						font-size: 11px;
					}
					.tool-container {
						display: flex;
						align-items: stretch;
						gap: 8px;
						margin-bottom: 8px;
					}
					.tool-item {
						flex: 1;
						min-width: 0;
						padding: 10px 12px;
						border: 1px solid var(--vscode-input-border, transparent);
						border-radius: 4px;
					}
					.tool-item strong {
						font-family: var(--vscode-editor-font-family, monospace);
						font-size: 12px;
					}
					.tool-item p {
						margin: 4px 0 0;
						color: var(--vscode-descriptionForeground);
						font-size: 12px;
					}
					.tool-button {
						width: auto;
						min-width: 64px;
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
					.response-header {
						font-size: 12px;
						font-weight: 600;
						margin-bottom: 8px;
						text-transform: uppercase;
						letter-spacing: 0.04em;
					}
					.response-header.success {
						color: var(--vscode-testing-iconPassed);
					}
					.response-header.error {
						color: var(--vscode-testing-iconFailed);
					}
					#executeButton.success {
						background-color: var(--vscode-testing-iconPassed);
						border-color: var(--vscode-testing-iconPassed);
						color: var(--vscode-button-foreground);
					}
					#executeButton.error {
						background-color: var(--vscode-testing-iconFailed);
						border-color: var(--vscode-testing-iconFailed);
						color: var(--vscode-button-foreground);
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
						background-color: transparent;
						color: var(--vscode-icon-foreground, var(--vscode-foreground));
						border-color: transparent;
					}
					.header-row .remove-btn:hover {
						background-color: var(--vscode-toolbar-hoverBackground);
					}
					.add-header-btn {
						width: auto;
						margin-top: 4px;
						padding: 4px 12px;
						background-color: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
					}
					.add-header-btn:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
					}
				</style>
			</head>
			<body>
				<div class="container">
					<header class="page-header">
						<h1>MCP Inspector</h1>
						<p class="page-subtitle">Connect to an MCP server, inspect its tools, and call them with your own arguments.</p>
					</header>
					<div class="form-group">
						<label for="transportType">Server type</label>
						<select id="transportType" onchange="handleTransportChange()">
							<option value="stdio" ${this._isWeb ? 'disabled' : 'selected'}>Local (STDIO)</option>
							<option value="remote" ${this._isWeb ? 'selected' : ''}>Remote (URL)</option>
						</select>
					</div>

					<!-- STDIO Section -->
					<div id="stdioSection" class="transport-section ${this._isWeb ? '' : 'active'}">
						${this._isWeb ? '<div class="web-note">STDIO is not available in VS Code for the Web. Use the desktop app or Codespaces, or connect to a remote server over SSE or Streamable HTTP.</div>' : ''}
						<div class="form-group">
							<label for="command">Command</label>
							<div class="input-with-button">
								<input type="text" id="command" placeholder="Path to the server script, for example ./server.js">
								${this._isWeb ? '' : '<button type="button" id="browseCommand" onclick="pickCommand()">Browse…</button>'}
							</div>
							<p class="hint">A script path, or a command already on your <code>PATH</code> such as <code>npx</code>.</p>
						</div>
						<div class="form-group">
							<label for="scriptArgs">Arguments</label>
							<input type="text" id="scriptArgs" placeholder="Optional, for example --port 3001">
						</div>
					</div>

					<!-- Remote Section -->
					<div id="remoteSection" class="transport-section ${this._isWeb ? 'active' : ''}">
						<div class="form-group">
							<label for="serverUrl">Server URL</label>
							<input type="text" id="serverUrl" placeholder="https://example.com/mcp">
							<p class="hint">The transport is detected automatically: Streamable HTTP first, SSE for <code>/sse</code> endpoints.</p>
						</div>
						<div class="form-group">
							<label for="authMode">Authentication</label>
							<select id="authMode" onchange="handleAuthModeChange()">
								<option value="oauth">Automatic (browser sign-in)</option>
								<option value="static">Static header / token</option>
							</select>
							<p class="hint" id="authHint">If the server answers 401, the inspector opens its sign-in page.</p>
						</div>
						<div class="form-group">
							<label>Headers</label>
							<div id="headersList"></div>
							<button type="button" class="add-header-btn" onclick="addHeader()">+ Add header</button>
							<p class="hint">Sent with every request, for example <code>Authorization: Bearer &lt;token&gt;</code>.</p>
						</div>
					</div>

					<div class="button-row">
						<button id="connectButton" onclick="connect()">
							<span id="connectButtonText">Connect</span>
						</button>
					</div>

					<div id="statusPanel" class="status">
						<span id="statusIndicator" class="status-indicator status-disconnected"></span>
						<div>
							<div id="status" class="status-text">Not connected</div>
							<details id="statusDetails" class="status-details" hidden>
								<summary>Technical details</summary>
								<pre id="statusDetailsText"></pre>
							</details>
						</div>
					</div>
					${relayPrompt}

					<div id="toolsContainer" class="tools-container">
						<div class="tools-header">
							<h2>Available tools</h2>
							<span id="toolCount" class="tool-count"></span>
						</div>
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
									<button type="submit" id="executeButton">Execute</button>
								</div>
							</form>
							<div id="responseViewer" class="response-viewer">
								<div id="responseHeader" class="response-header"></div>
								<pre id="responseContent"></pre>
							</div>
						</div>
					</div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const isWeb = ${this._isWeb};
					const relayBase = "${RELAY_BASE_URL}";
					let isConnected = false;
					let relayAttempted = false;
					let executeStartedAt = 0;
					let _initialized = false;

					function setStatus(kind, text, details) {
						const panel = document.getElementById('statusPanel');
						const indicator = document.getElementById('statusIndicator');
						const detailsBox = document.getElementById('statusDetails');
						const detailsText = document.getElementById('statusDetailsText');

						panel.className = kind ? 'status ' + kind : 'status';
						indicator.className = 'status-indicator status-' + (kind || 'disconnected');
						document.getElementById('status').textContent = text;

						if (details) {
							detailsText.textContent = details;
							detailsBox.hidden = false;
						} else {
							detailsText.textContent = '';
							detailsBox.hidden = true;
						}
					}

					function setBusy(busy) {
						const button = document.getElementById('connectButton');
						button.disabled = busy;
						document.getElementById('connectButtonText').textContent = busy
							? 'Connecting…'
							: (isConnected ? 'Disconnect' : 'Connect');
					}

					function handleTransportChange() {
						const transportType = document.getElementById('transportType').value;
						document.getElementById('stdioSection').classList.toggle('active', transportType === 'stdio');
						document.getElementById('remoteSection').classList.toggle('active', transportType === 'remote');
						saveState();
					}

					function handleAuthModeChange() {
						const mode = document.getElementById('authMode').value;
						document.getElementById('authHint').textContent = mode === 'static'
							? 'Add an Authorization header below. The inspector will not start a sign-in flow.'
							: 'If the server answers 401, the inspector opens its sign-in page.';
						saveState();
					}

					function saveState() {
						if (!_initialized) {
							return;
						}
						vscode.setState({
							transportType: document.getElementById('transportType').value,
							command: document.getElementById('command').value,
							scriptArgs: document.getElementById('scriptArgs').value,
							serverUrl: document.getElementById('serverUrl').value,
							authMode: document.getElementById('authMode').value
						});
					}

					function restoreState() {
						const state = vscode.getState();
						if (!state) {
							return;
						}

						// Older versions stored "sse" or "streamable-http" as the transport.
						let transportType = state.transportType;
						if (transportType === 'sse' || transportType === 'streamable-http') {
							transportType = 'remote';
						}
						if (transportType && !(isWeb && transportType === 'stdio')) {
							document.getElementById('transportType').value = transportType;
							document.getElementById('stdioSection').classList.toggle('active', transportType === 'stdio');
							document.getElementById('remoteSection').classList.toggle('active', transportType === 'remote');
						}
						if (state.command) {
							document.getElementById('command').value = state.command;
						}
						if (state.scriptArgs) {
							document.getElementById('scriptArgs').value = state.scriptArgs;
						}
						const savedUrl = state.serverUrl || state.streamableHttpUrl;
						if (savedUrl) {
							document.getElementById('serverUrl').value = savedUrl;
						}
						if (state.authMode) {
							document.getElementById('authMode').value = state.authMode;
						}
						handleAuthModeChange();
					}

					function pickCommand() {
						vscode.postMessage({ command: 'pickCommand' });
					}

					function openRelayRepo() {
						vscode.postMessage({ command: 'openRelayRepo' });
					}

					function addHeader(key = '', value = '') {
						const list = document.getElementById('headersList');
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

					function getHeaders() {
						const rows = document.getElementById('headersList').querySelectorAll('.header-row');
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

					function getServerUrl() {
						return document.getElementById('serverUrl').value.trim();
					}

					function connectViaRelay() {
						const upstream = getServerUrl();
						if (!upstream) {
							return;
						}
						relayAttempted = true;
						hideRelayPrompt();
						setBusy(true);
						setStatus('', 'Connecting through the relay…');
						vscode.postMessage({
							command: 'connect',
							data: {
								transport: 'remote',
								serverUrl: upstream,
								authMode: document.getElementById('authMode').value,
								headers: getHeaders(),
								relayBase
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

						relayAttempted = false;
						hideRelayPrompt();

						if (isWeb && transportType === 'stdio') {
							setStatus('error', 'STDIO is not available in VS Code for the Web.');
							return;
						}

						if (transportType === 'stdio') {
							const command = document.getElementById('command').value.trim();
							const args = document.getElementById('scriptArgs').value;
							if (!command) {
								setStatus('error', 'Enter the command that starts the server.');
								return;
							}
							connectionData = {
								transport: 'stdio',
								command: command,
								args: args
							};
						} else {
							const serverUrl = getServerUrl();
							if (!serverUrl) {
								setStatus('error', 'Enter the server URL.');
								return;
							}
							connectionData = {
								transport: 'remote',
								serverUrl,
								authMode: document.getElementById('authMode').value,
								headers: getHeaders()
							};
						}

						setBusy(true);
						setStatus('', 'Connecting…');

						// Send connection data to extension
						vscode.postMessage({
							command: 'connect',
							data: connectionData
						});
					}

					function disconnect() {
						setBusy(true);
						vscode.postMessage({
							command: 'disconnect'
						});
					}

					function updateConnectionUI(connected, transportName, toolCount) {
						const toolsContainer = document.getElementById('toolsContainer');

						isConnected = connected;
						document.getElementById('connectButtonText').textContent = connected ? 'Disconnect' : 'Connect';
						document.getElementById('connectButton').classList.toggle('secondary', connected);
						document.getElementById('connectButton').disabled = false;

						if (connected) {
							const parts = ['Connected'];
							if (transportName) {
								parts.push(transportName);
							}
							if (toolCount !== undefined) {
								parts.push(toolCount + (toolCount === 1 ? ' tool' : ' tools'));
							}
							setStatus('success', parts.join(' · '));
							toolsContainer.classList.add('visible');
						} else {
							setStatus('', 'Not connected');
							toolsContainer.classList.remove('visible');
						}
					}

					function transportName(transport) {
						return transport === 'sse' ? 'SSE' : 'Streamable HTTP';
					}

					function displayTools(tools) {
						const toolsList = document.getElementById('toolsList');
						toolsList.replaceChildren();
						document.getElementById('toolCount').textContent = tools.length + (tools.length === 1 ? ' tool' : ' tools');

						tools.forEach(tool => {
							const schemaString = encodeURIComponent(JSON.stringify({
								properties: tool.input_schema?.properties || {},
								required: tool.input_schema?.required || []
							}));

							const row = document.createElement('div');
							row.className = 'tool-container';

							const item = document.createElement('div');
							item.className = 'tool-item';
							const name = document.createElement('strong');
							name.textContent = tool.name;
							const description = document.createElement('p');
							description.textContent = tool.description || '';
							item.append(name, description);

							const run = document.createElement('button');
							run.className = 'tool-button';
							run.textContent = 'Run';
							run.addEventListener('click', () => showToolModal(tool.name, schemaString));

							row.append(item, run);
							toolsList.appendChild(row);
						});
					}

					// Handle messages from the extension
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'connectionStatus':
								if (message.data.phase) {
									setStatus('connecting', message.data.phase);
									break;
								}
								if (message.data.disconnected) {
									updateConnectionUI(false);
									hideRelayPrompt();
								} else if (message.data.success) {
									const tools = message.data.tools || [];
									updateConnectionUI(
										true,
										message.data.transport ? transportName(message.data.transport) : '',
										tools.length
									);
									hideRelayPrompt();
									displayTools(tools);
								} else {
									updateConnectionUI(false);
									const error = message.data.error || 'Unknown error';
									const serverUrl = getServerUrl();
									const alreadyRelay = serverUrl.startsWith(relayBase);
									const offerRelay = isWeb && message.data.corsLikely && !message.data.authRequired && !relayAttempted && !alreadyRelay;
									const details = message.data.details && message.data.details !== error
										? message.data.details
										: undefined;
									const authMessage = message.data.authRequired
										? (document.getElementById('authMode').value === 'static'
											? 'This server requires authentication. Add an Authorization header, or switch Authentication to Automatic.'
											: 'Sign-in did not complete. Try connecting again, or check that the server allows this browser origin for its OAuth endpoints.')
										: null;

									// The callout explains the failure when it is shown, so do not repeat it here.
									setStatus('error', offerRelay ? 'Connection failed.' : (authMessage || error), details);
									if (offerRelay) {
										document.getElementById('relayPrompt').style.display = 'block';
									}
								}
								break;
							case 'commandPicked': {
								const commandInput = document.getElementById('command');
								commandInput.value = message.data.path;
								commandInput.dispatchEvent(new Event('input'));
								break;
							}
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
						const executeButton = document.getElementById('executeButton');
						executeButton.disabled = false;
						executeButton.textContent = 'Execute';
						executeButton.classList.remove('success', 'error');
						const responseHeader = document.getElementById('responseHeader');
						responseHeader.className = 'response-header';
						responseHeader.textContent = '';

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
							label.textContent = key;
							if (isRequired) {
								const marker = document.createElement('span');
								marker.className = 'required-field';
								marker.textContent = '*';
								label.append(' ', marker);
							}
							
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

							// The call can take a while, and the result renders below
							// the buttons, so show progress and keep it in view.
							executeStartedAt = performance.now();
							executeButton.disabled = true;
							executeButton.textContent = 'Executing…';
							executeButton.classList.remove('success', 'error');
							responseViewer.style.display = 'block';
							const responseHeader = document.getElementById('responseHeader');
							responseHeader.className = 'response-header';
							responseHeader.textContent = 'Running';
							responseContent.textContent = 'Waiting for the server…';
							responseViewer.scrollIntoView({ block: 'nearest' });

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

					// Tool results are usually a text content array; show that
					// instead of raw JSON, and fall back to the JSON otherwise.
					function formatToolResult(data) {
						if (!data) {
							return '';
						}
						if (data.success === false) {
							return data.error || 'Unknown error';
						}
						const content = data.result && data.result.content;
						if (Array.isArray(content)) {
							const text = content
								.filter(part => part && part.type === 'text')
								.map(part => part.text)
								.join('\\n');
							if (text) {
								return text;
							}
						}
						return JSON.stringify(data.result ?? data, null, 2);
					}

					// Handle tool execution response
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'toolExecutionResponse': {
								const responseViewer = document.getElementById('responseViewer');
								const responseContent = document.getElementById('responseContent');
								const responseHeader = document.getElementById('responseHeader');
								const executeButton = document.getElementById('executeButton');
								const data = message.data || {};
								const failed = data.success === false
									|| (data.result && data.result.isError === true);
								const elapsed = executeStartedAt
									? ((performance.now() - executeStartedAt) / 1000).toFixed(1) + 's'
									: '';

								executeButton.disabled = false;
								executeButton.textContent = failed ? 'Failed' : 'Executed';
								executeButton.classList.toggle('success', !failed);
								executeButton.classList.toggle('error', failed);

								responseHeader.className = 'response-header ' + (failed ? 'error' : 'success');
								responseHeader.textContent = (failed ? 'Failed' : 'Success')
									+ (elapsed ? ' · ' + elapsed : '');
								responseViewer.style.display = 'block';
								responseContent.textContent = formatToolResult(data);
								responseViewer.scrollIntoView({ block: 'nearest' });
								break;
							}
						}
					});

					restoreState();
					_initialized = true;
					['command', 'scriptArgs', 'serverUrl'].forEach(id => {
						document.getElementById(id).addEventListener('input', saveState);
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
			this._mcpClient = new MCPClient(this._secrets);

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

	private async handleRemoteConnection(connectionData: any) {
		try {
			this._mcpClient = new MCPClient(this._secrets);

			const serverUrl = connectionData.serverUrl;
			const headers: Record<string, string> | undefined =
				connectionData.headers && Object.keys(connectionData.headers).length > 0
					? connectionData.headers
					: undefined;
			const relayBase: string | undefined = connectionData.relayBase;
			const authMode = connectionData.authMode === 'static' ? 'static' : 'oauth';

			const result = await this._mcpClient.connectToRemote(
				serverUrl,
				headers,
				relayBase,
				(phase) => {
					this._panel.webview.postMessage({
						command: 'connectionStatus',
						data: { phase },
					});
				},
				authMode,
			);

			if (result.success) {
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: true,
						tools: result.tools,
						transport: result.transport
					}
				});
			} else {
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: false,
						error: result.error,
						details: result.details,
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

	private async handlePickCommand() {
		const selection = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			openLabel: 'Use as command',
			title: 'Select the MCP server script',
			filters: {
				'Server scripts': ['js', 'mjs', 'cjs', 'ts', 'py', 'sh', 'rb', 'exe', 'cmd', 'bat'],
				'All files': ['*'],
			},
		});

		const picked = selection?.[0];
		if (picked) {
			this._panel.webview.postMessage({
				command: 'commandPicked',
				data: { path: picked.fsPath },
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