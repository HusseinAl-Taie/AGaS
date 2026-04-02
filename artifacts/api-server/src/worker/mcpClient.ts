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

interface JsonRpcResponse {
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * MCP Client supporting both JSON-RPC over HTTP POST (streamable HTTP transport)
 * and the legacy SSE transport (SSE stream + POST to /messages endpoint).
 *
 * Transport detection:
 * - First, attempt a JSON-RPC POST to serverUrl (Streamable HTTP / HTTP+JSON transport).
 *   If the server responds with a non-4xx/5xx status and valid JSON-RPC, we use HTTP mode.
 * - If that fails (e.g. the server only accepts SSE), fall back to SSE mode:
 *   Open an SSE stream on `serverUrl` (Accept: text/event-stream), extract the `endpoint`
 *   event to get the POST URL, then POST JSON-RPC messages there.
 *
 * Reference: https://spec.modelcontextprotocol.io/specification/basic/transports/
 */
export class McpClient {
  private serverUrl: string;
  private authHeaders: Record<string, string>;
  private discoveredTools: McpTool[] | null = null;

  // Detected transport: "http" | "sse" | null (unknown)
  private transport: "http" | "sse" | null = null;
  // For SSE transport: the endpoint URL extracted from the SSE `endpoint` event
  private ssePostUrl: string | null = null;

  constructor(serverUrl: string, authConfig: Record<string, unknown> = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, ""); // strip trailing slash
    this.authHeaders = {};
    if (authConfig.apiKey && typeof authConfig.apiKey === "string") {
      this.authHeaders["Authorization"] = `Bearer ${authConfig.apiKey}`;
    }
    if (authConfig.bearerToken && typeof authConfig.bearerToken === "string") {
      this.authHeaders["Authorization"] = `Bearer ${authConfig.bearerToken}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async discoverTools(): Promise<McpTool[]> {
    if (this.discoveredTools !== null) {
      return this.discoveredTools;
    }

    const response = await this.sendRequest({ method: "tools/list", params: {} });

    if (!response || typeof response !== "object") {
      this.discoveredTools = [];
      return [];
    }

    const result = response as { tools?: McpTool[] };
    this.discoveredTools = result.tools ?? [];
    return this.discoveredTools;
  }

  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<McpToolResult> {
    let result: unknown;
    try {
      result = await this.sendRequest({
        method: "tools/call",
        params: { name: toolName, arguments: toolInput },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool execution error: ${message}` }], isError: true };
    }

    if (!result || typeof result !== "object") {
      return { content: [{ type: "text", text: "(empty result)" }] };
    }

    return result as McpToolResult;
  }

  // ---------------------------------------------------------------------------
  // Transport layer
  // ---------------------------------------------------------------------------

  /**
   * Send a JSON-RPC 2.0 request, auto-detecting and switching transport as needed.
   * Returns the `result` value from the JSON-RPC response, or throws on error.
   */
  private async sendRequest(payload: { method: string; params: unknown }): Promise<unknown> {
    const rpc = {
      jsonrpc: "2.0" as const,
      id: Date.now(),
      method: payload.method,
      params: payload.params,
    };

    // Auto-detect transport on first call
    if (this.transport === null) {
      await this.detectTransport(rpc);
    }

    if (this.transport === "http") {
      return this.sendHttp(rpc);
    } else {
      return this.sendSse(rpc);
    }
  }

  /**
   * Probe the server to detect whether it accepts Streamable HTTP (POST) or SSE.
   * Sets `this.transport` as a side-effect.
   */
  private async detectTransport(sampleRpc: object): Promise<void> {
    // Try Streamable HTTP first
    try {
      const result = await this.sendHttp(sampleRpc, { probe: true });
      if (result !== null) {
        this.transport = "http";
        return;
      }
    } catch {
      // fall through to SSE
    }

    // Try SSE transport
    try {
      await this.initSseSession();
      this.transport = "sse";
    } catch (err) {
      logger.warn({ url: this.serverUrl, err }, "MCP transport detection failed; defaulting to http");
      this.transport = "http"; // best effort fallback
    }
  }

  /**
   * Send a JSON-RPC request via plain HTTP POST (Streamable HTTP / HTTP+JSON transport).
   * When `probe: true`, returns null on HTTP errors instead of throwing.
   */
  private async sendHttp(
    rpc: object,
    opts: { probe?: boolean } = {}
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(this.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...this.authHeaders,
        },
        body: JSON.stringify(rpc),
        signal: controller.signal,
        redirect: "error",
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (opts.probe) return null;
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get("content-type") ?? "";

      // Server returned an SSE stream for this request (streamable HTTP with SSE body)
      if (contentType.includes("text/event-stream")) {
        return this.parseFirstSseResult(res);
      }

      // Regular JSON response
      const data = (await res.json()) as JsonRpcResponse;
      if (data.error) throw new Error(data.error.message);
      return data.result ?? null;
    } catch (err) {
      clearTimeout(timeout);
      if (opts.probe) return null;
      throw err;
    }
  }

  /**
   * For SSE transport: open the SSE stream on serverUrl to receive the session endpoint URL,
   * then use that URL for subsequent POST requests.
   */
  private async initSseSession(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 15_000);

    try {
      const res = await fetch(this.serverUrl, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...this.authHeaders,
        },
        signal: controller.signal,
        redirect: "error",
      });

      if (!res.ok || !res.body) {
        clearTimeout(timeout);
        throw new Error(`SSE init failed: HTTP ${res.status}`);
      }

      // Read SSE events until we find `event: endpoint` with a data URL
      const postUrl = await this.readSseEndpoint(res, controller);
      clearTimeout(timeout);

      if (!postUrl) throw new Error("SSE session did not provide an endpoint URL");

      // Resolve relative URL against the server origin
      this.ssePostUrl = postUrl.startsWith("http")
        ? postUrl
        : new URL(postUrl, this.serverUrl).toString();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Read SSE stream until we find the `endpoint` event, then return its data.
   */
  private async readSseEndpoint(
    res: Response,
    controller: AbortController
  ): Promise<string | null> {
    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventType = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (eventType === "endpoint") {
              reader.cancel();
              controller.abort();
              return data;
            }
            eventType = "";
          } else if (line === "") {
            eventType = "";
          }
        }
      }
    } catch {
      // aborted — that's expected once we find the endpoint
    } finally {
      reader.cancel().catch(() => {});
    }

    return null;
  }

  /**
   * Send a JSON-RPC request via SSE transport:
   * POST to `ssePostUrl` and wait for the response in the SSE stream.
   *
   * Note: many SSE MCP servers respond to the POST synchronously with the
   * JSON-RPC result in the HTTP response body rather than pushing it back
   * over the SSE stream. We handle both patterns.
   */
  private async sendSse(rpc: object): Promise<unknown> {
    if (!this.ssePostUrl) {
      await this.initSseSession();
    }

    const postUrl = this.ssePostUrl!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...this.authHeaders,
        },
        body: JSON.stringify(rpc),
        signal: controller.signal,
        redirect: "error",
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`SSE POST failed: HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        return this.parseFirstSseResult(res);
      }

      // Synchronous JSON response (common pattern)
      const data = (await res.json()) as JsonRpcResponse;
      if (data.error) throw new Error(data.error.message);
      return data.result ?? null;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Parse the first `data:` event carrying a JSON-RPC result from an SSE response body.
   */
  private async parseFirstSseResult(res: Response): Promise<unknown> {
    if (!res.body) throw new Error("No body in SSE response");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as JsonRpcResponse;
              if (parsed.error) throw new Error(parsed.error.message);
              if (parsed.result !== undefined) {
                reader.cancel();
                return parsed.result;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.startsWith("data:")) continue;
              throw parseErr;
            }
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    throw new Error("SSE stream ended without a result");
  }
}
