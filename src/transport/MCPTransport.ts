import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
    SSEClientTransport,
    SseError,
  } from "@modelcontextprotocol/sdk/client/sse.js";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as tls from 'tls';
import { Agent as UndiciAgent, fetch as undiciFetch, RequestInit as UndiciRequestInit } from 'undici';
// Author: https://github.com/agorianin
export interface SSLOptions {
    enabled: boolean;
    p12Path?: string;
    passphrase?: string;
    rejectUnauthorized?: boolean;
    caCertPath?: string;
}

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
    private sslAgent: UndiciAgent | null = null;
    private originalFetch: typeof globalThis.fetch | null = null;

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

    async connectToSSE(serverUrl: string, sslOptions?: SSLOptions): Promise<{ success: boolean; tools?: Tool[]; error?: string }> {
        try {
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                throw new Error("Server URL must start with http:// or https://");
            }

            let transportOpts: any = {};

            // Configure SSL if enabled
            // Author: https://github.com/agorianin
            if (sslOptions?.enabled && sslOptions.p12Path) {
                if (!fs.existsSync(sslOptions.p12Path)) {
                    throw new Error(`Certificate file not found: ${sslOptions.p12Path}`);
                }

                const pfxBuffer = fs.readFileSync(sslOptions.p12Path);
                
                console.log('Loading P12 certificate, size:', pfxBuffer.length, 'bytes');
                
                // Verify the PFX can be parsed
                try {
                    tls.createSecureContext({
                        pfx: pfxBuffer,
                        passphrase: sslOptions.passphrase || '',
                    });
                    console.log('Successfully validated P12 certificate');
                } catch (certError) {
                    console.error('Failed to parse P12 certificate:', certError);
                    throw new Error(`Invalid certificate or wrong password: ${certError instanceof Error ? certError.message : 'Unknown error'}`);
                }

                // Load CA certificate if provided
                let caCert: Buffer | undefined;
                if (sslOptions.caCertPath && fs.existsSync(sslOptions.caCertPath)) {
                    caCert = fs.readFileSync(sslOptions.caCertPath);
                    console.log('Loaded CA certificate, size:', caCert.length, 'bytes');
                }

                // Create undici agent with client certificate
                this.sslAgent = new UndiciAgent({
                    connect: {
                        pfx: pfxBuffer,
                        passphrase: sslOptions.passphrase || '',
                        rejectUnauthorized: sslOptions.rejectUnauthorized !== false,
                        ca: caCert,
                    },
                });
                console.log('Created undici agent with client certificate');

                // Store original fetch to restore later
                this.originalFetch = globalThis.fetch;

                // Create custom fetch function that uses the SSL agent
                const sslAgentRef = this.sslAgent;
                const customFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
                    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
                    
                    console.log('SSL fetch request:', urlString, init?.method || 'GET');
                    
                    const undiciInit: UndiciRequestInit = {
                        method: (init?.method || 'GET') as UndiciRequestInit['method'],
                        headers: init?.headers as UndiciRequestInit['headers'],
                        body: init?.body as UndiciRequestInit['body'],
                        dispatcher: sslAgentRef,
                    };

                    const response = await undiciFetch(urlString, undiciInit);
                    console.log('SSL fetch response status:', response.status);
                    return response as unknown as Response;
                };

                // Replace globalThis.fetch so SDK's internal calls use our SSL fetch
                (globalThis as any).fetch = customFetch;
                console.log('Replaced globalThis.fetch with SSL-enabled fetch');

                // Pass custom fetch to eventSourceInit for SSE connections
                transportOpts = {
                    eventSourceInit: {
                        fetch: customFetch,
                    },
                };
                
                // Also set NODE_TLS_REJECT_UNAUTHORIZED for additional coverage if self-signed is allowed
                if (sslOptions.rejectUnauthorized === false) {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                    console.log('Disabled TLS certificate verification (insecure mode)');
                }
            }

            this.transport = new SSEClientTransport(new URL(serverUrl), transportOpts);

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
            let errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
            // Add more details for debugging
            if (e instanceof Error && e.cause) {
                errorMessage += ` (Cause: ${e.cause})`;
            }
            console.error('SSE Connection Error:', e);
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
        
        // Restore original fetch
        if (this.originalFetch) {
            (globalThis as any).fetch = this.originalFetch;
            this.originalFetch = null;
            console.log('Restored original globalThis.fetch');
        }
        
        // Close SSL agent if it was created
        if (this.sslAgent) {
            await this.sslAgent.close();
            this.sslAgent = null;
            console.log('Closed SSL agent');
        }
        
        // Reset TLS rejection setting
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
} 