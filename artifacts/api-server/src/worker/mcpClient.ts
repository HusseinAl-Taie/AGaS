import { logger } from "../lib/logger";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class McpClient {
  private serverUrl: string;
  private authConfig: Record<string, unknown>;
  private tools: McpTool[] = [];

  constructor(serverUrl: string, authConfig: Record<string, unknown> = {}) {
    this.serverUrl = serverUrl;
    this.authConfig = authConfig;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.authConfig.apiKey && typeof this.authConfig.apiKey === "string") {
      headers["Authorization"] = `Bearer ${this.authConfig.apiKey}`;
    }
    return headers;
  }

  async discoverTools(): Promise<McpTool[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.serverUrl}`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
        redirect: "error",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn({ url: this.serverUrl, status: response.status }, "MCP tool discovery failed");
        return [];
      }

      const data = await response.json() as { result?: { tools?: McpTool[] } };
      this.tools = data.result?.tools ?? [];
      return this.tools;
    } catch (err) {
      clearTimeout(timeout);
      logger.warn({ url: this.serverUrl, err }, "MCP tool discovery error");
      return [];
    }
  }

  async executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<McpToolResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.serverUrl}`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolInput,
          },
        }),
        signal: controller.signal,
        redirect: "error",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Tool call failed: HTTP ${response.status}` }],
          isError: true,
        };
      }

      const data = await response.json() as { result?: McpToolResult; error?: { message: string } };

      if (data.error) {
        return {
          content: [{ type: "text", text: `Tool error: ${data.error.message}` }],
          isError: true,
        };
      }

      return data.result ?? { content: [{ type: "text", text: "Empty response from tool" }] };
    } catch (err) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : "Unknown tool execution error";
      return {
        content: [{ type: "text", text: `Tool execution failed: ${message}` }],
        isError: true,
      };
    }
  }
}
