import * as vscode from 'vscode';

// Register the view provider 
export class McpInspectorViewProvider implements vscode.WebviewViewProvider {

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [],
		};

        // Map the webview Renderer to the view type
		webviewView.webview.html = this._getRenderer();

        // Handle message from webview to core
		webviewView.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'createNewRequest':
						vscode.commands.executeCommand('mcp--inspector.createNewRequest');
						break;
				}
			},
			undefined,
			[]
		);
	}

    // Get the HTML renderer for the webview
	private _getRenderer() {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>MCP Inspector</title>
			</head>
			<body>
				<div style="padding: 10px;">
					<button onclick="createNewRequest()" style="width: 100%; padding: 8px; margin-bottom: 10px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer;">
						Create New Request
					</button>
				</div>
				<script>
					const vscode = acquireVsCodeApi();
					function createNewRequest() {
						vscode.postMessage({ command: 'createNewRequest' });
					}
				</script>
			</body>
			</html>
		`;
	}
}