import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
    SSEClientTransport,
    SseError,
  } from "@modelcontextprotocol/sdk/client/sse.js";
import * as vscode from 'vscode';

interface InputSchema {
    type: 'object';

    properties?: unknown | null;
    [k: string]: unknown;
  }

interface Tool {
    name: string;
    description?: string
    input_schema: InputSchema;
}


export class MCPClient {
    private mcp: Client;
    private transport: StdioClientTransport | SSEClientTransport | null = null;
    private tools: Tool[] = [];

    constructor() {
        this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
    }

    async connectToStdio(scriptPath: string, args: string = ''): Promise<{ success: boolean; error?: string; tools?: any[] }> {
        try {
            const argsArray = args.trim() ? args.split(/\s+/) : [];
            this.transport = new StdioClientTransport({ 
                command: scriptPath,
                args: argsArray,
             });
             
             this.mcp.connect(this.transport);
            
            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                };
            });

            vscode.window.showInformationMessage(`Connected to MCP server via STDIO with ${this.tools.length} tools`);
            return { success: true, tools: this.tools };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect to MCP server via STDIO: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to connect to STDIO server'
            };
        }
    }

    async connectToSSE(serverUrl: string): Promise<{ success: boolean; tools?: Tool[]; error?: string }> {
        try {
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                throw new Error("Server URL must start with http:// or https://");
            }

            this.transport = new SSEClientTransport(new URL(serverUrl));

            await this.mcp.connect(this.transport);
            
            const toolsResult = await this.mcp.listTools();
            console.log(toolsResult);
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                };
            });

            vscode.window.showInformationMessage(`Connected to MCP server via SSE with ${this.tools.length} tools`);
            return { success: true, tools: this.tools };
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to connect to MCP server via SSE: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    async executeTool(toolName: string,toolArgs:Record<string,any>): Promise<{ success: boolean; result?: any; error?: string }> {
        if (!this.transport) {
            return { success: false, error: "Not connected to any transport" };
        }

        try {
            const result = await this.mcp.callTool({
                name: toolName,
                arguments: toolArgs
            });
            return { success: true, result };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to execute tool ${toolName}: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    async disconnect(): Promise<void> {
        if (this.transport) {
            await this.mcp.close();
            this.transport = null;
            this.tools = [];
        }
    }
} 