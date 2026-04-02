import { pgTable, text, uuid, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { agentsTable } from "./agents";

export const scheduledTriggersTable = pgTable("scheduled_triggers", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTable.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  cronExpression: text("cron_expression").notNull(),
  inputTemplate: jsonb("input_template").notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScheduledTriggerSchema = createInsertSchema(scheduledTriggersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScheduledTrigger = z.infer<typeof insertScheduledTriggerSchema>;
export type ScheduledTrigger = typeof scheduledTriggersTable.$inferSelect;
