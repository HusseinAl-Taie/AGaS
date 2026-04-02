import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, agentRunsTable, agentsTable, mcpConnectionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { McpClient } from "./mcpClient";

type RunStatus = (typeof agentRunsTable.$inferSelect)["status"];

interface RunStep {
  type: "thought" | "tool_call" | "tool_result" | "final_answer";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolCallId?: string;
  isError?: boolean;
  tokens?: number;
  timestamp: string;
}

interface PendingState {
  messages: Anthropic.MessageParam[];
  pendingToolUse: Anthropic.ToolUseBlock[];
}

// Approximate cost per token in cents for Claude Sonnet
// $3/1M input + $15/1M output → ~$9/1M avg → 0.0009 cents/token
const COST_PER_TOKEN_CENTS = 0.0009;

export class AgentRunner {
  private runId: string;
  private agentId: string;
  private tenantId: string;

  constructor(runId: string, agentId: string, tenantId: string) {
    this.runId = runId;
    this.agentId = agentId;
    this.tenantId = tenantId;
  }

  async execute(): Promise<void> {
    const [run] = await db
      .select()
      .from(agentRunsTable)
      .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));

    if (!run) {
      throw new Error(`Run ${this.runId} not found`);
    }

    if (run.status === "cancelled" || run.status === "completed" || run.status === "failed") {
      return;
    }

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.id, this.agentId), eq(agentsTable.tenantId, this.tenantId)));

    if (!agent) {
      await this.failRun("Agent not found");
      return;
    }

    await db
      .update(agentRunsTable)
      .set({ status: "running", startedAt: run.startedAt ?? new Date() })
      .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));

    // Restore state from prior steps
    const steps: RunStep[] = Array.isArray(run.steps)
      ? (run.steps as unknown as RunStep[])
      : [];
    let totalTokens = run.totalTokens ?? 0;
    let costCents = run.costCents ?? 0;

    // Load MCP connections
    const toolWhitelist = Array.isArray(agent.tools) ? (agent.tools as string[]) : [];
    const mcpClients = await this.loadMcpClients(toolWhitelist);
    const allTools = await this.discoverTools(mcpClients);
    const anthropicTools: Anthropic.Tool[] = allTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    // Determine starting messages — either fresh or resumed from saved state
    let messages: Anthropic.MessageParam[];
    let pendingToolUse: Anthropic.ToolUseBlock[] | null = null;

    const savedOutput = run.output as Record<string, unknown> | null;
    if (
      run.status === "running" &&
      savedOutput &&
      Array.isArray(savedOutput.messages) &&
      Array.isArray(savedOutput.pendingToolUse)
    ) {
      // Resuming from human_in_loop approval — tool calls were saved
      messages = savedOutput.messages as Anthropic.MessageParam[];
      pendingToolUse = savedOutput.pendingToolUse as Anthropic.ToolUseBlock[];
    } else {
      // Fresh start
      const inputData = (run.input as Record<string, unknown>) ?? {};
      const userMessage =
        typeof inputData.message === "string"
          ? inputData.message
          : JSON.stringify(inputData) !== "{}"
            ? JSON.stringify(inputData)
            : "Please complete the task.";

      messages = [{ role: "user", content: userMessage }];
    }

    let stepCount = steps.length;

    try {
      // If we resumed with pending tool calls, process them first
      if (pendingToolUse && pendingToolUse.length > 0) {
        const toolResults = await this.executeToolCalls(pendingToolUse, steps, mcpClients);
        messages.push({ role: "user", content: toolResults });
        await this.saveProgress(steps, totalTokens, costCents);
        pendingToolUse = null;
      }

      while (stepCount < agent.maxSteps) {
        // Check for cancellation
        const [currentRun] = await db
          .select({ status: agentRunsTable.status })
          .from(agentRunsTable)
          .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));

        if (!currentRun || currentRun.status === "cancelled") {
          logger.info({ runId: this.runId }, "Run cancelled, stopping");
          return;
        }

        const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
          model: agent.model || "claude-sonnet-4-6",
          max_tokens: 8192,
          system: agent.systemPrompt || "You are a helpful AI assistant.",
          messages,
          ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
        };

        const response = await anthropic.messages.create(requestParams);

        const stepTokens = response.usage.input_tokens + response.usage.output_tokens;
        totalTokens += stepTokens;
        costCents += stepTokens * COST_PER_TOKEN_CENTS;
        stepCount++;

        // Budget check
        if (costCents > agent.maxBudgetCents) {
          steps.push({
            type: "thought",
            content: `Budget limit reached: ${costCents.toFixed(2)} cents used, limit ${agent.maxBudgetCents} cents`,
            timestamp: new Date().toISOString(),
          });
          await this.updateRun("budget_exceeded", steps, totalTokens, costCents, null, "Budget exceeded");
          return;
        }

        const assistantContent: Anthropic.ContentBlock[] = response.content;
        const toolUseBlocks = assistantContent.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        // Record text thoughts
        for (const block of assistantContent) {
          if (block.type === "text" && block.text) {
            steps.push({
              type: "thought",
              content: block.text,
              tokens: stepTokens,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Check for terminal stop
        if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
          const finalText = assistantContent
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n");

          steps.push({
            type: "final_answer",
            content: finalText || "Task completed.",
            timestamp: new Date().toISOString(),
          });

          await this.updateRun("completed", steps, totalTokens, costCents, { answer: finalText }, null);
          return;
        }

        // Human-in-the-loop pause before tool execution
        if (agent.approvalMode === "human_in_loop") {
          const toolSummary = toolUseBlocks
            .map((t) => `${t.name}(${JSON.stringify(t.input)})`)
            .join(", ");

          steps.push({
            type: "thought",
            content: `Awaiting human approval to execute: ${toolSummary}`,
            timestamp: new Date().toISOString(),
          });

          const pendingState: PendingState = {
            messages: [...messages, { role: "assistant", content: assistantContent }],
            pendingToolUse: toolUseBlocks,
          };

          await db
            .update(agentRunsTable)
            .set({
              status: "awaiting_approval",
              steps: steps as unknown as Record<string, unknown>[],
              totalTokens,
              costCents: Math.round(costCents),
              output: pendingState as unknown as Record<string, unknown>,
            })
            .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));
          return;
        }

        // Auto-approve: execute tool calls
        messages.push({ role: "assistant", content: assistantContent });
        const toolResults = await this.executeToolCalls(toolUseBlocks, steps, mcpClients);
        messages.push({ role: "user", content: toolResults });

        await this.saveProgress(steps, totalTokens, costCents);
      }

      // Max steps reached
      steps.push({
        type: "thought",
        content: `Max steps (${agent.maxSteps}) reached without completing the task.`,
        timestamp: new Date().toISOString(),
      });
      await this.updateRun("failed", steps, totalTokens, costCents, null, `Max steps exceeded`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ runId: this.runId, err }, "AgentRunner execution error");
      steps.push({
        type: "thought",
        content: `Execution error: ${message}`,
        timestamp: new Date().toISOString(),
      });
      await this.updateRun("failed", steps, totalTokens, costCents, null, message);
    }
  }

  private async executeToolCalls(
    toolUseBlocks: Anthropic.ToolUseBlock[],
    steps: RunStep[],
    mcpClients: Map<string, McpClient>
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      steps.push({
        type: "tool_call",
        content: `Calling tool: ${toolUse.name}`,
        toolName: toolUse.name,
        toolInput: toolUse.input as Record<string, unknown>,
        toolCallId: toolUse.id,
        timestamp: new Date().toISOString(),
      });

      const result = await this.executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        mcpClients
      );

      const resultText = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");

      steps.push({
        type: "tool_result",
        content: resultText || "(empty result)",
        toolName: toolUse.name,
        toolCallId: toolUse.id,
        isError: result.isError,
        timestamp: new Date().toISOString(),
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: resultText || "(empty result)",
        is_error: result.isError,
      });
    }

    return toolResults;
  }

  private async loadMcpClients(toolWhitelist: string[]): Promise<Map<string, McpClient>> {
    const clients = new Map<string, McpClient>();

    if (toolWhitelist.length === 0) {
      return clients;
    }

    const connections = await db
      .select()
      .from(mcpConnectionsTable)
      .where(
        and(
          eq(mcpConnectionsTable.tenantId, this.tenantId),
          inArray(mcpConnectionsTable.id, toolWhitelist)
        )
      );

    for (const conn of connections) {
      const authConfig = (conn.authConfig as Record<string, unknown>) ?? {};
      clients.set(conn.id, new McpClient(conn.serverUrl, authConfig));
    }

    return clients;
  }

  private async discoverTools(mcpClients: Map<string, McpClient>) {
    const allTools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> = [];

    for (const client of mcpClients.values()) {
      const tools = await client.discoverTools();
      for (const tool of tools) {
        allTools.push(tool);
      }
    }

    return allTools;
  }

  private async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>,
    mcpClients: Map<string, McpClient>
  ) {
    // Cache tool names per client to avoid repeated discovery
    for (const client of mcpClients.values()) {
      const tools = await client.discoverTools();
      if (tools.some((t) => t.name === toolName)) {
        return client.executeTool(toolName, toolInput);
      }
    }

    return {
      content: [{ type: "text", text: `Tool "${toolName}" not found in any MCP server` }],
      isError: true,
    };
  }

  private async saveProgress(steps: RunStep[], totalTokens: number, costCents: number) {
    await db
      .update(agentRunsTable)
      .set({
        steps: steps as unknown as Record<string, unknown>[],
        totalTokens,
        costCents: Math.round(costCents),
      })
      .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));
  }

  private async updateRun(
    status: RunStatus,
    steps: RunStep[],
    totalTokens: number,
    costCents: number,
    output: Record<string, unknown> | null,
    error: string | null
  ) {
    await db
      .update(agentRunsTable)
      .set({
        status,
        steps: steps as unknown as Record<string, unknown>[],
        totalTokens,
        costCents: Math.round(costCents),
        output: output ?? undefined,
        error: error ?? undefined,
        completedAt: new Date(),
      })
      .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));
  }

  private async failRun(error: string) {
    await db
      .update(agentRunsTable)
      .set({
        status: "failed",
        error,
        completedAt: new Date(),
      })
      .where(and(eq(agentRunsTable.id, this.runId), eq(agentRunsTable.tenantId, this.tenantId)));
  }
}
