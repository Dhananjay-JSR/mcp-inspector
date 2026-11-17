import * as vscode from 'vscode';
import { MCPClient } from '../transport/MCPTransport';
import { vscodeNotifier } from '../transport/vscodeNotifier';
import { clientInfo } from '../transport/clientInfo';
import type { Tool } from '@dhananjay-jsr/mcp-inspector-core';
import { normalizeTlsConfig, readTlsConfig, saveTlsConfig } from '../transport/tlsSettings';
import { buildToolArguments, buildToolFields, parseRawArguments } from '@dhananjay-jsr/mcp-inspector-core';
import type { ToolField } from '@dhananjay-jsr/mcp-inspector-core';
import { uiTemplate } from './uiTemplate.generated';

const RELAY_BASE_URL = 'https://mcp-relay.dhananjaay.dev';
const RELAY_REPO_URL = 'https://github.com/Dhananjay-JSR/mcp-inspector-relay';

function uiUriOf(tool: Tool): string | undefined {
	const meta = tool._meta as
		| { ui?: { resourceUri?: string; csp?: unknown }; 'ui/resourceUri'?: string }
		| undefined;
	return meta?.ui?.resourceUri ?? meta?.['ui/resourceUri'];
}

export class MCPInspectorPanel {
	public static currentPanel: MCPInspectorPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];
    private _mcpClient: MCPClient | null = null;
    private _tools = new Map<string, Tool>();
    private readonly _isWeb: boolean;
    private readonly _secrets?: vscode.SecretStorage;

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		secrets?: vscode.SecretStorage,
	) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._isWeb = vscode.env.uiKind === vscode.UIKind.Web;
		this._secrets = secrets;

		this._panel.webview.html = this._getRenderer(this._panel.webview, this._extensionUri);

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
                    case 'checkApps':
                        await this.handleAppsCheck();
                        break;
                    case 'renderApps':
                        await this.handleRenderApps(message.data?.tool);
                        break;
                    case 'viewRequest':
                        await this.handleViewRequest(message.data);
                        break;
                    case 'executeTool':
                        await this.handleToolExecution(message.data);
                        break;
                    case 'pickCommand':
                        await this.handlePickCommand();
                        break;
                    case 'copyToClipboard':
                        await vscode.env.clipboard.writeText(message.data?.text ?? '');
                        break;
                    case 'openSettings':
                        await this.handleOpenSettings(message.data?.kind);
                        break;
                    case 'openRelayRepo':
                        await vscode.env.openExternal(vscode.Uri.parse(RELAY_REPO_URL));
                        break;
                    case 'ready':
                        await this.postTlsConfig();
                        break;
                    case 'pickTlsFile':
                        await this.handlePickTlsFile(message.data?.field);
                        break;
                    case 'saveTlsConfig':
                        if (!this._isWeb) {
                            await saveTlsConfig(normalizeTlsConfig(message.data));
                        }
                        break;
				}
			},
			null,
			this._disposables
		);

		if (!this._isWeb) {
			vscode.workspace.onDidChangeConfiguration(
				(event) => {
					if (event.affectsConfiguration('mcp--inspector.tls')) {
						void this.postTlsConfig();
					}
				},
				null,
				this._disposables,
			);
		}
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

	private _getRenderer(webview: vscode.Webview, extensionUri: vscode.Uri) {
		const asset = (name: string) =>
			webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'ui', name)).toString();
		const relayHost = RELAY_BASE_URL.replace('https://', '');

		return uiTemplate
			.replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource)
			.replace(/\{\{STYLE_URI\}\}/g, asset('styles.css'))
			.replace(/\{\{APP_URI\}\}/g, asset('app.js'))
			.replace(/\{\{IS_WEB\}\}/g, String(this._isWeb))
			.replace(/\{\{RELAY_BASE\}\}/g, RELAY_BASE_URL)
			.replace(/\{\{RELAY_HOST\}\}/g, relayHost);
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

    /**
     * Keeps the tool schemas for execution and describes their controls to the
     * webview. Field mapping stays on this side so desktop and web share it.
     */
    private rememberTools(tools: Tool[] | undefined): Array<Tool & { fields: ToolField[] }> {
        const list = tools ?? [];
        this._tools = new Map(list.map((tool) => [tool.name, tool]));
        return list.map((tool) => ({
            ...tool,
            fields: buildToolFields(tool.input_schema),
        }));
    }

    private async handleStdioConnection(connectionData: any) {
		try {
			// Create a new MCP client for this session
			this._tools.clear();
			this._mcpClient = new MCPClient(this._secrets, undefined, vscodeNotifier, clientInfo());

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
						tools: this.rememberTools(result.tools)
					}
				});
				void this.handleAppsCheck();
			} else {
				// Send error message back to webview
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: false,
						error: result.error,
						details: result.details,
						kind: result.kind
					}
				});
			}
		} catch (error) {
			this._panel.webview.postMessage({
				command: 'connectionStatus',
				data: {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error occurred',
					kind: 'transport'
				}
			});
		}
	}

	private async handleRemoteConnection(connectionData: any) {
		try {
			const tls = connectionData.tls
				? normalizeTlsConfig(connectionData.tls)
				: readTlsConfig();
			if (connectionData.tls) {
				await saveTlsConfig(tls);
			}
			this._tools.clear();
			this._mcpClient = new MCPClient(this._secrets, tls, vscodeNotifier, clientInfo());

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
						tools: this.rememberTools(result.tools),
						transport: result.transport
					}
				});
				void this.handleAppsCheck();
			} else {
				this._panel.webview.postMessage({
					command: 'connectionStatus',
					data: {
						success: false,
						error: result.error,
						details: result.details,
						corsLikely: result.corsLikely,
						kind: result.kind,
						curl: result.curl
					}
				});

				// The panel may be hidden or the user may be in the browser
				// finishing sign-in, so surface the failure as a notification too.
				const notification = result.corsLikely
					? 'Connection failed: the server did not allow this editor\u2019s origin. Use the relay or allow the origin.'
					: result.authRequired
						? `Sign-in failed: ${result.error ?? 'Unknown error'}`
						: (result.error ?? 'Could not connect to the MCP server');
				void vscode.window.showErrorMessage(`MCP Inspector: ${notification}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error occurred';
			this._panel.webview.postMessage({
				command: 'connectionStatus',
				data: {
					success: false,
					error: message,
					kind: 'transport'
				}
			});
			void vscode.window.showErrorMessage(`MCP Inspector: ${message}`);
		}
	}

	private async postTlsConfig() {
		if (this._isWeb) {
			return;
		}
		this._panel.webview.postMessage({
			command: 'tlsConfig',
			data: readTlsConfig(),
		});
	}

	private async handlePickTlsFile(field: unknown) {
		if (this._isWeb || (field !== 'ca' && field !== 'cert' && field !== 'key')) {
			return;
		}

		const labels = {
			ca: { open: 'Use CA bundle', title: 'Select the certificate authority bundle' },
			cert: { open: 'Use client certificate', title: 'Select the client certificate' },
			key: { open: 'Use client key', title: 'Select the client private key' },
		} as const;

		const selection = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			openLabel: labels[field].open,
			title: labels[field].title,
			filters: {
				'PEM files': ['pem', 'crt', 'cer', 'key'],
				'All files': ['*'],
			},
		});

		const picked = selection?.[0];
		if (picked) {
			this._panel.webview.postMessage({
				command: 'tlsFilePicked',
				data: { field, path: picked.fsPath },
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
			this._tools.clear();
			
			// Send disconnect status to webview
			this._panel.webview.postMessage({
				command: 'connectionStatus',
				data: {
					success: true,
					disconnected: true
				}
			});
			this._panel.webview.postMessage({ command: 'appsFindings', data: null });
			this._panel.webview.postMessage({ command: 'appsRender', data: null });
		}
    }

	private async handleAppsCheck() {
		if (!this._mcpClient) {
			return;
		}

		this._panel.webview.postMessage({
			command: 'appsStatus',
			data: { phase: 'Checking MCP Apps…' },
		});

		try {
			const result = await this._mcpClient.checkApps();
			this._panel.webview.postMessage({ command: 'appsFindings', data: result });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._panel.webview.postMessage({
				command: 'appsFindings',
				data: {
					findings: [],
					verdict: { ok: false, summary: `Could not check MCP Apps: ${message}` },
					connectError: message,
				},
			});
		}
	}

	private async handleRenderApps(toolName?: string) {
		if (!this._mcpClient) {
			return;
		}

		const tools = [...this._tools.values()];
		const tool = toolName
			? this._tools.get(toolName)
			: tools.find(candidate => uiUriOf(candidate));
		const uri = tool ? uiUriOf(tool) : undefined;

		if (!tool || !uri) {
			this._panel.webview.postMessage({
				command: 'appsStatus',
				data: { phase: 'No tool declares a UI resource.', failed: true },
			});
			return;
		}

		this._panel.webview.postMessage({
			command: 'appsStatus',
			data: { phase: `Rendering ${tool.name}…` },
		});

		try {
			const resource = await this._mcpClient.readResource(uri);
			const content = resource.contents?.[0] as
				| { text?: string; blob?: string; _meta?: { ui?: { csp?: unknown } } }
				| undefined;

			let html = content?.text;
			if (!html && content?.blob) {
				const bytes = Uint8Array.from(atob(content.blob), char => char.charCodeAt(0));
				html = new TextDecoder().decode(bytes);
			}
			if (!html) {
				throw new Error('The UI resource returned no HTML.');
			}

			const call = await this._mcpClient.executeTool(tool.name, {});
			const result = call.result ?? {
				content: call.error ? [{ type: 'text', text: call.error }] : [],
				isError: !call.success,
			};
			const meta = tool._meta as { ui?: { csp?: unknown } } | undefined;
			const csp = meta?.ui?.csp ?? content?._meta?.ui?.csp;

			this._panel.webview.postMessage({
				command: 'appsRender',
				data: {
					tool: tool.name,
					uri,
					html,
					csp,
					args: {},
					result,
					success: call.success,
					error: call.error,
				},
			});
		} catch (error) {
			this._panel.webview.postMessage({
				command: 'appsStatus',
				data: {
					phase: `Render failed: ${error instanceof Error ? error.message : String(error)}`,
					failed: true,
				},
			});
		}
	}

	private async handleViewRequest(data: { id?: number; method?: string; params?: any }) {
		const id = data?.id;
		if (id === undefined || !this._mcpClient) {
			return;
		}

		try {
			if (data.method === 'tools/call') {
				const call = await this._mcpClient.executeTool(
					data.params?.name,
					data.params?.arguments ?? {},
				);
				const result = call.success
					? call.result
					: { content: [{ type: 'text', text: call.error ?? 'Tool failed' }], isError: true };
				this._panel.webview.postMessage({
					command: 'viewResponse',
					data: { id, result },
				});
				return;
			}

			if (data.method === 'resources/read') {
				const result = await this._mcpClient.readResource(data.params?.uri);
				this._panel.webview.postMessage({
					command: 'viewResponse',
					data: { id, result },
				});
				return;
			}

			if (data.method === 'ping') {
				this._panel.webview.postMessage({
					command: 'viewResponse',
					data: { id, result: {} },
				});
				return;
			}

			this._panel.webview.postMessage({
				command: 'viewResponse',
				data: { id, error: { code: -32601, message: `Unsupported host call: ${data.method}` } },
			});
		} catch (error) {
			this._panel.webview.postMessage({
				command: 'viewResponse',
				data: {
					id,
					error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
				},
			});
		}
	}

	private async handleOpenSettings(kind?: string) {
		const query = kind === 'tls'
			? 'mcp--inspector.tls'
			: '@ext:DhananjaySenday.mcp--inspector';
		await vscode.commands.executeCommand('workbench.action.openSettings', query);
	}

	private async handleToolExecution(payload: any) {
		const toolName = typeof payload?.toolName === 'string' ? payload.toolName : '';
		try {
			if (!this._mcpClient) {
				throw new Error('Not connected to MCP server');
			}

			const tool = this._tools.get(toolName);
			if (!tool) {
				throw new Error(`Unknown tool: ${toolName || '(missing name)'}`);
			}

			const built = payload?.mode === 'raw'
				? parseRawArguments(
					typeof payload?.text === 'string' ? payload.text : '',
					tool.input_schema,
				)
				: buildToolArguments(
					tool.input_schema,
					payload && typeof payload.values === 'object' && payload.values
						? payload.values
						: {},
				);

			if (built.errors.length > 0) {
				this._panel.webview.postMessage({
					command: 'toolValidationErrors',
					data: { errors: built.errors }
				});
				return;
			}

			const result = await this._mcpClient.executeTool(toolName, built.arguments);
			
			this._panel.webview.postMessage({
				command: 'toolExecutionResponse',
				data: result
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error occurred';
			this._panel.webview.postMessage({
				command: 'toolExecutionResponse',
				data: {
					success: false,
					error: message,
					kind: message === 'Not connected to MCP server' ? 'transport' : 'tool'
				}
			});
		}
	}
}