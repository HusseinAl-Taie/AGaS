import { pgTable, text, uuid, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const approvalModeEnum = pgEnum("approval_mode", ["auto", "human_in_loop"]);
export const agentStatusEnum = pgEnum("agent_status", ["active", "paused", "archived"]);

export const agentsTable = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  tools: jsonb("tools").notNull().default([]),
  maxSteps: integer("max_steps").notNull().default(20),
  maxBudgetCents: integer("max_budget_cents").notNull().default(100),
  approvalMode: approvalModeEnum("approval_mode").notNull().default("auto"),
  status: agentStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
