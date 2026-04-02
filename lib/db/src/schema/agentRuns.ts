import { pgTable, text, uuid, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { agentsTable } from "./agents";

export const runTriggerEnum = pgEnum("run_trigger", ["manual", "api", "schedule", "webhook"]);
export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
  "budget_exceeded",
]);

export const agentRunsTable = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTable.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  trigger: runTriggerEnum("trigger").notNull().default("manual"),
  input: jsonb("input").notNull().default({}),
  status: runStatusEnum("status").notNull().default("queued"),
  output: jsonb("output"),
  steps: jsonb("steps").notNull().default([]),
  totalTokens: integer("total_tokens").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentRunSchema = createInsertSchema(agentRunsTable).omit({ id: true, createdAt: true });
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type AgentRun = typeof agentRunsTable.$inferSelect;
