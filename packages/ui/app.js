import { getState, onAny, platform, send, setState } from "./bridge.js";
import { disposeView, mountView } from "./view-host.js";

const isWeb = platform.isWeb;
const relayBase = platform.relayBase;
let isConnected = false;
let relayAttempted = false;
let executeStartedAt = 0;
let lastError = null;
let lastToolPayload = null;
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
		? 'Send an Authorization header with every request. The inspector will not start an OAuth flow.'
		: 'OAuth 2.0 authorization code flow with PKCE (RFC 6749). The inspector opens a browser only when the server advertises OAuth metadata; a plain 401 shows an authentication error instead.';
	saveState();
}

function saveState() {
	if (!_initialized) {
		return;
	}
	setState({
		transportType: document.getElementById('transportType').value,
		command: document.getElementById('command').value,
		scriptArgs: document.getElementById('scriptArgs').value,
		serverUrl: document.getElementById('serverUrl').value,
		authMode: document.getElementById('authMode').value,
		tlsCaFile: tlsValue('tlsCaFile'),
		tlsClientCertFile: tlsValue('tlsClientCertFile'),
		tlsClientKeyFile: tlsValue('tlsClientKeyFile')
	});
}

function restoreState() {
	const state = getState();
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
	['tlsCaFile', 'tlsClientCertFile', 'tlsClientKeyFile'].forEach(id => {
		const input = document.getElementById(id);
		if (input && state[id]) {
			input.value = state[id];
		}
	});
	handleAuthModeChange();
}

function pickCommand() {
	send('pickCommand');
}

function openRelayRepo() {
	send('openRelayRepo');
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

function tlsValue(id) {
	const field = document.getElementById(id);
	return field ? field.value.trim() : '';
}

function getTlsConfig() {
	return {
		caPath: tlsValue('tlsCaFile') || undefined,
		certPath: tlsValue('tlsClientCertFile') || undefined,
		keyPath: tlsValue('tlsClientKeyFile') || undefined
	};
}

function pickTlsFile(field) {
	send('pickTlsFile', { field });
}

function clearTlsFile(field) {
	const ids = { ca: 'tlsCaFile', cert: 'tlsClientCertFile', key: 'tlsClientKeyFile' };
	const input = document.getElementById(ids[field]);
	if (input) {
		input.value = '';
		tlsChanged();
	}
}

function tlsChanged() {
	saveState();
	send('saveTlsConfig', getTlsConfig());
}

function errorTitle(kind) {
	return {
		config: 'Configuration',
		dns: 'Host not found',
		tls: 'TLS certificate',
		cors: 'Blocked by the browser',
		auth: 'Authentication',
		transport: 'Network',
		protocol: 'Protocol',
		tool: 'Tool call'
	}[kind] || 'Connection failed';
}

function hideErrorCard() {
	const card = document.getElementById('errorCard');
	if (card) {
		card.hidden = true;
	}
	lastError = null;
}

function showErrorCard(data, offerRelay) {
	const card = document.getElementById('errorCard');
	const message = data.error || 'Unknown error';
	const details = data.details || message;
	const kind = data.kind || (data.authRequired ? 'auth' : 'transport');
	lastError = {
		kind: kind,
		curl: data.curl || ''
	};

	document.getElementById('errorCardTitle').textContent = errorTitle(kind);
	document.getElementById('errorCardMessage').textContent = message;
	document.getElementById('errorCardDetails').textContent = details;
	document.getElementById('settingsErrorButton').hidden = isWeb || kind !== 'tls';
	document.getElementById('curlErrorButton').hidden = !data.curl;
	document.getElementById('relayErrorButton').hidden = !offerRelay;
	document.getElementById('relayNote').hidden = !offerRelay;
	card.hidden = false;
	card.scrollIntoView({ block: 'nearest' });
}

function retryConnection() {
	hideErrorCard();
	connect();
}

function openErrorSettings() {
	if (!lastError) {
		return;
	}
	send('openSettings', { kind: lastError.kind });
}

function copyErrorCurl() {
	if (!lastError || !lastError.curl) {
		return;
	}
	send('copyToClipboard', { text: lastError.curl });
	const button = document.getElementById('curlErrorButton');
	const label = button.textContent;
	button.textContent = 'Copied';
	setTimeout(() => {
		button.textContent = label;
	}, 1200);
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
	hideErrorCard();
	setBusy(true);
	setStatus('', 'Connecting through the relay…');
	send('connect', {
			transport: 'remote',
			serverUrl: upstream,
			authMode: document.getElementById('authMode').value,
			headers: getHeaders(),
			tls: isWeb ? undefined : getTlsConfig(),
			relayBase
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
	hideErrorCard();

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
			headers: getHeaders(),
			tls: isWeb ? undefined : getTlsConfig()
		};
	}

	setBusy(true);
	setStatus('', 'Connecting…');

	// Send connection data to extension
	send('connect', connectionData);
}

function disconnect() {
	setBusy(true);
	send('disconnect');
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

let connectedTools = [];

function uiUri(tool) {
	const meta = tool && tool._meta;
	return (meta && meta.ui && meta.ui.resourceUri) || (meta && meta['ui/resourceUri']);
}

function setAppsSummary(text, kind) {
	const summary = document.getElementById('appsSummary');
	summary.textContent = text || '';
	summary.className = 'apps-summary' + (kind ? ' ' + kind : '');
}

function findingCard(finding) {
	const card = document.createElement('div');
	card.className = 'finding finding-' + (finding.severity || 'info');
	const header = document.createElement('div');
	header.className = 'finding-header';
	const id = document.createElement('span');
	id.className = 'finding-id';
	id.textContent = finding.id;
	const title = document.createElement('span');
	title.className = 'finding-title';
	title.textContent = finding.title;
	header.append(id, title);

	const detail = document.createElement('p');
	detail.className = 'finding-detail';
	detail.textContent = finding.detail;

	const fix = document.createElement('p');
	fix.className = 'finding-fix';
	fix.textContent = 'Fix: ' + finding.fix;

	card.append(header, detail, fix);

	if (finding.tool || finding.resourceUri) {
		const meta = document.createElement('p');
		meta.className = 'finding-meta';
		meta.textContent = [
			finding.tool ? 'tool: ' + finding.tool : '',
			finding.resourceUri ? 'resource: ' + finding.resourceUri : '',
		].filter(Boolean).join('  ·  ');
		card.append(meta);
	}

	return card;
}

function renderAppsFindings(result) {
	const panel = document.getElementById('appsPanel');
	const list = document.getElementById('appsFindings');
	const renderButton = document.getElementById('appsRenderButton');

	if (!result) {
		panel.hidden = true;
		list.replaceChildren();
		setAppsSummary('');
		return;
	}

	panel.hidden = false;
	list.replaceChildren();

	if (result.connectError) {
		setAppsSummary((result.verdict && result.verdict.summary) || 'Could not check MCP Apps.', 'fail');
	} else {
		setAppsSummary(
			(result.verdict && result.verdict.summary) || '',
			result.verdict && result.verdict.ok ? 'ok' : 'fail'
		);
	}

	renderButton.hidden = !connectedTools.some(tool => uiUri(tool));

	for (const finding of result.findings || []) {
		list.appendChild(findingCard(finding));
	}
}

function checkApps() {
	setAppsSummary('Checking MCP Apps…');
	send('checkApps');
}

function renderApps(tool) {
	const target = tool || (connectedTools.find(candidate => uiUri(candidate)) || {}).name;
	if (!target) {
		setAppsSummary('No tool declares a UI resource.', 'fail');
		return;
	}
	setAppsSummary('Rendering ' + target + '…');
	document.getElementById('appsRenderButton').hidden = false;
	send('renderApps', { tool: target });
}

function displayTools(tools) {
	const toolsList = document.getElementById('toolsList');
	toolsList.replaceChildren();
	document.getElementById('toolCount').textContent = tools.length + (tools.length === 1 ? ' tool' : ' tools');

	tools.forEach(tool => {
		const fields = Array.isArray(tool.fields) ? tool.fields : [];

		const row = document.createElement('div');
		row.className = 'tool-container';

		const item = document.createElement('div');
		item.className = 'tool-item';
		const name = document.createElement('strong');
		name.textContent = tool.name;
		const description = document.createElement('p');
		description.textContent = tool.description || '';
		item.append(name);

		const ui = tool._meta && tool._meta.ui;
		const uri = (ui && ui.resourceUri) || (tool._meta && tool._meta['ui/resourceUri']);
		if (uri) {
			const badge = document.createElement('span');
			badge.className = 'apps-badge';
			badge.textContent = 'MCP App';
			name.append(badge);
			if (Array.isArray(ui && ui.visibility) && ui.visibility.length > 0) {
				const chip = document.createElement('span');
				chip.className = 'apps-chip';
				chip.textContent = ui.visibility.join(' + ');
				item.append(chip);
			}
		}

		item.append(description);

		const run = document.createElement('button');
		run.className = 'tool-button';
		run.textContent = 'Run';
		run.addEventListener('click', () => showToolModal(tool.name, fields));

		row.append(item, run);

		if (uri) {
			const renderButton = document.createElement('button');
			renderButton.className = 'tool-button secondary';
			renderButton.textContent = 'Render';
			renderButton.addEventListener('click', () => renderApps(tool.name));
			row.append(renderButton);
		}

		toolsList.appendChild(row);
	});
}

// Handle messages from the extension
onAny(message => {
	switch (message.command) {
		case 'connectionStatus':
			if (message.data.phase) {
				setStatus('connecting', message.data.phase);
				break;
			}
			if (message.data.disconnected) {
				updateConnectionUI(false);
				hideErrorCard();
				connectedTools = [];
				renderAppsFindings(null);
				disposeView();
			} else if (message.data.success) {
				const tools = message.data.tools || [];
				connectedTools = tools;
				document.getElementById('appsPanel').hidden = false;
				updateConnectionUI(
					true,
					message.data.transport ? transportName(message.data.transport) : '',
					tools.length
				);
				hideErrorCard();
				displayTools(tools);
			} else {
				updateConnectionUI(false);
				const error = message.data.error || 'Unknown error';
				const serverUrl = getServerUrl();
				const alreadyRelay = serverUrl.startsWith(relayBase);
				const kind = message.data.authRequired
					? 'auth'
					: (message.data.kind || 'transport');
				const offerRelay = isWeb
					&& (message.data.corsLikely || message.data.kind === 'cors')
					&& !message.data.authRequired
					&& !relayAttempted
					&& !alreadyRelay;
				const authMessage = message.data.authRequired
					? (document.getElementById('authMode').value === 'static'
						? 'This server requires authentication. Add an Authorization header, or switch Authentication to Automatic.'
						: 'Sign-in did not complete. Try connecting again, or check that the server allows this browser origin for its OAuth endpoints.')
					: null;

				setStatus('error', 'Connection failed.');
				showErrorCard({
					error: authMessage || error,
					details: message.data.details || error,
					kind: kind,
					curl: message.data.curl
				}, offerRelay);
			}
			break;
		case 'appsStatus':
			setAppsSummary(message.data && message.data.phase ? message.data.phase : '', message.data && message.data.failed ? 'fail' : '');
			break;
		case 'appsFindings':
			renderAppsFindings(message.data);
			break;
		case 'appsRender': {
			const container = document.getElementById('appView');
			if (!message.data) {
				container.hidden = true;
				disposeView();
				break;
			}
			container.hidden = false;
			setAppsSummary(`Rendered ${message.data.tool}`, 'ok');
			mountView(container, {
				html: message.data.html,
				csp: message.data.csp,
				args: message.data.args,
				result: message.data.result,
				onIssue: (kind, data) => {
					if (kind === 'error') {
						setAppsSummary(`View error: ${(data && data.message) || 'unknown'}`, 'fail');
					} else if (kind === 'csp') {
						setAppsSummary(`View CSP violation: ${(data && data.violatedDirective) || 'blocked resource'}`, 'fail');
					}
				},
			});
			break;
		}
		case 'commandPicked': {
			const commandInput = document.getElementById('command');
			commandInput.value = message.data.path;
			commandInput.dispatchEvent(new Event('input'));
			break;
		}
		case 'tlsFilePicked': {
			const ids = { ca: 'tlsCaFile', cert: 'tlsClientCertFile', key: 'tlsClientKeyFile' };
			const input = document.getElementById(ids[message.data.field]);
			if (input) {
				input.value = message.data.path;
				tlsChanged();
			}
			break;
		}
		case 'tlsConfig': {
			const ids = {
				caPath: 'tlsCaFile',
				certPath: 'tlsClientCertFile',
				keyPath: 'tlsClientKeyFile'
			};
			Object.entries(ids).forEach(([key, id]) => {
				const input = document.getElementById(id);
				if (input) {
					input.value = message.data[key] || '';
				}
			});
			saveState();
			break;
		}
	}
});

function buildFieldInput(field) {
	if (field.control === 'boolean') {
		const input = document.createElement('input');
		input.type = 'checkbox';
		if (field.defaultValue === true) {
			input.checked = true;
		}
		return input;
	}

	if (field.control === 'enum') {
		const select = document.createElement('select');
		const placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = 'Select…';
		select.appendChild(placeholder);
		(field.enumValues || []).forEach(value => {
			const option = document.createElement('option');
			option.value = String(value);
			option.textContent = String(value);
			select.appendChild(option);
		});
		if (field.defaultValue !== undefined && field.defaultValue !== null) {
			select.value = String(field.defaultValue);
		}
		return select;
	}

	if (field.control === 'json') {
		const textarea = document.createElement('textarea');
		textarea.className = 'json-field';
		textarea.rows = 4;
		textarea.spellcheck = false;
		textarea.placeholder = field.container === 'array' ? '[]' : '{}';
		if (field.defaultValue !== undefined && field.defaultValue !== null) {
			textarea.value = JSON.stringify(field.defaultValue, null, 2);
		}
		return textarea;
	}

	const input = document.createElement('input');
	if (field.control === 'number' || field.control === 'integer') {
		input.type = 'number';
		input.step = field.control === 'integer' ? '1' : 'any';
	} else {
		input.type = 'text';
	}
	if (field.defaultValue !== undefined && field.defaultValue !== null) {
		input.value = String(field.defaultValue);
	}
	return input;
}

function createToolField(field) {
	const container = document.createElement('div');
	container.className = 'form-group';

	const label = document.createElement('label');
	label.htmlFor = 'field-' + field.name;
	label.textContent = field.name;
	if (field.required) {
		const marker = document.createElement('span');
		marker.className = 'required-field';
		marker.textContent = '*';
		label.append(' ', marker);
	}
	container.appendChild(label);

	const input = buildFieldInput(field);
	input.id = 'field-' + field.name;
	input.name = field.name;
	if (field.control === 'boolean') {
		const row = document.createElement('div');
		row.className = 'boolean-field';
		row.appendChild(input);
		container.appendChild(row);
	} else {
		container.appendChild(input);
	}

	const hints = [];
	if (field.description) {
		hints.push(field.description);
	}
	if (field.control === 'json') {
		hints.push('JSON ' + (field.container === 'array' ? 'array' : 'object') + '.');
	}
	if (hints.length) {
		const hint = document.createElement('span');
		hint.className = 'field-hint';
		hint.textContent = hints.join(' ');
		container.appendChild(hint);
	}

	return container;
}

function clearToolErrors() {
	const box = document.getElementById('toolErrors');
	box.replaceChildren();
	box.hidden = true;
	document.querySelectorAll('[aria-invalid="true"]').forEach(element => {
		element.removeAttribute('aria-invalid');
	});
}

function showToolErrors(errors) {
	const box = document.getElementById('toolErrors');
	box.replaceChildren();
	const heading = document.createElement('strong');
	heading.textContent = 'Fix these before running';
	box.appendChild(heading);
	const list = document.createElement('ul');
	errors.forEach(error => {
		const item = document.createElement('li');
		item.textContent = error.name
			? error.name + ' ' + error.message
			: error.message;
		list.appendChild(item);
		if (error.name) {
			const input = document.getElementById('field-' + error.name);
			if (input) {
				input.setAttribute('aria-invalid', 'true');
			}
		}
	});
	box.appendChild(list);
	box.hidden = false;
	box.scrollIntoView({ block: 'nearest' });
}

function toggleRawMode() {
	const raw = document.getElementById('rawMode').checked;
	document.getElementById('toolFields').hidden = raw;
	document.getElementById('rawArgsGroup').hidden = !raw;
	clearToolErrors();
}

function hideToolError() {
	const card = document.getElementById('toolErrorCard');
	if (card) {
		card.hidden = true;
	}
}

function showToolError(data) {
	const card = document.getElementById('toolErrorCard');
	const message = data.error || 'The tool call failed.';
	const kind = data.kind || 'tool';
	document.getElementById('toolErrorTitle').textContent = errorTitle(kind);
	document.getElementById('toolErrorMessage').textContent = message;
	document.getElementById('toolErrorDetails').textContent = data.details || message;
	document.getElementById('retryToolButton').hidden = !lastToolPayload;
	card.hidden = false;
	card.scrollIntoView({ block: 'nearest' });
}

function submitToolPayload(data) {
	lastToolPayload = data;
	hideToolError();
	executeStartedAt = performance.now();
	const executeButton = document.getElementById('executeButton');
	const responseViewer = document.getElementById('responseViewer');
	const responseHeader = document.getElementById('responseHeader');
	const responseContent = document.getElementById('responseContent');
	executeButton.disabled = true;
	executeButton.textContent = 'Executing…';
	executeButton.classList.remove('success', 'error');
	responseViewer.style.display = 'block';
	responseHeader.className = 'response-header';
	responseHeader.textContent = 'Running';
	responseContent.textContent = 'Waiting for the server…';
	responseViewer.scrollIntoView({ block: 'nearest' });

	send('executeTool', data);
}

function retryTool() {
	if (!lastToolPayload) {
		return;
	}
	submitToolPayload(lastToolPayload);
}

function showToolModal(toolName, fields) {
	const modal = document.getElementById('toolModal');
	const modalTitle = document.getElementById('modalTitle');
	const toolFields = document.getElementById('toolFields');
	const responseViewer = document.getElementById('responseViewer');
	const responseContent = document.getElementById('responseContent');
	fields = Array.isArray(fields) ? fields : [];

	// Reset the form and response viewer
	toolFields.replaceChildren();
	responseViewer.style.display = 'none';
	responseContent.textContent = '';
	const executeButton = document.getElementById('executeButton');
	executeButton.disabled = false;
	executeButton.textContent = 'Execute';
	executeButton.classList.remove('success', 'error');
	const responseHeader = document.getElementById('responseHeader');
	responseHeader.className = 'response-header';
	responseHeader.textContent = '';
	document.getElementById('copyButton').style.display = 'none';
	document.getElementById('rawMode').checked = false;
	document.getElementById('rawArgs').value = '';
	lastToolPayload = null;
	clearToolErrors();
	hideToolError();

	modalTitle.textContent = 'Execute ' + toolName;
	fields.forEach(field => toolFields.appendChild(createToolField(field)));
	toggleRawMode();

	// Handle form submission
	const form = document.getElementById('toolForm');
	form.onsubmit = async (e) => {
		e.preventDefault();

		const raw = document.getElementById('rawMode').checked;
		const data = { toolName: toolName };
		if (raw) {
			data.mode = 'raw';
			data.text = document.getElementById('rawArgs').value;
		} else {
			data.mode = 'form';
			data.values = {};
			fields.forEach(field => {
				const input = document.getElementById('field-' + field.name);
				if (!input) {
					return;
				}
				data.values[field.name] = field.control === 'boolean'
					? input.checked
					: input.value;
			});
		}

		// The call can take a while, and the result renders below
		// the buttons, so show progress and keep it in view.
		clearToolErrors();
		submitToolPayload(data);
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

// Pretty-print text content that is itself JSON.
function prettyText(value) {
	if (typeof value !== 'string') {
		return String(value);
	}
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return value;
	}
}

function copyResult() {
	const responseContent = document.getElementById('responseContent');
	const copyButton = document.getElementById('copyButton');
	send('copyToClipboard', { text: responseContent.textContent || '' });
	copyButton.textContent = 'Copied';
	setTimeout(() => {
		copyButton.textContent = 'Copy';
	}, 1200);
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
			.map(part => prettyText(part.text))
			.join('\\n');
		if (text) {
			return text;
		}
	}
	return JSON.stringify(data.result ?? data, null, 2);
}

// Handle tool execution response
onAny(message => {
	switch (message.command) {
		case 'toolValidationErrors': {
			const executeButton = document.getElementById('executeButton');
			const responseViewer = document.getElementById('responseViewer');
			executeButton.disabled = false;
			executeButton.textContent = 'Execute';
			executeButton.classList.remove('success', 'error');
			responseViewer.style.display = 'none';
			hideToolError();
			showToolErrors(message.data?.errors || []);
			break;
		}
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
			if (data.success === false) {
				document.getElementById('copyButton').style.display = 'none';
				responseViewer.style.display = 'none';
				showToolError(data);
				break;
			}

			hideToolError();
			document.getElementById('copyButton').style.display = 'inline-block';
			responseViewer.style.display = 'block';
			responseContent.textContent = formatToolResult(data);
			responseViewer.scrollIntoView({ block: 'nearest' });
			break;
		}
	}
});

function applyPlatformChrome() {
	const select = document.getElementById('transportType');
	const stdio = select.querySelector('option[value="stdio"]');
	if (isWeb) {
		stdio.disabled = true;
		select.value = 'remote';
	} else {
		select.value = 'stdio';
	}
	handleTransportChange();
}

applyPlatformChrome();
restoreState();
_initialized = true;
send('ready');
['command', 'scriptArgs', 'serverUrl'].forEach(id => {
	document.getElementById(id).addEventListener('input', saveState);
});

// Inline HTML attributes resolve against window; esbuild wraps this file.
Object.assign(window, {
	addHeader,
	checkApps,
	clearTlsFile,
	closeModal,
	connect,
	connectViaRelay,
	copyErrorCurl,
	copyResult,
	handleAuthModeChange,
	handleTransportChange,
	hideErrorCard,
	hideToolError,
	openErrorSettings,
	openRelayRepo,
	pickCommand,
	renderApps,
	pickTlsFile,
	retryConnection,
	retryTool,
	toggleRawMode,
	tlsChanged,
});
