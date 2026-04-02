import { pgTable, text, uuid, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const mcpConnectionStatusEnum = pgEnum("mcp_connection_status", ["active", "inactive", "error"]);

export const mcpConnectionsTable = pgTable("mcp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  serverUrl: text("server_url").notNull(),
  authConfig: jsonb("auth_config").notNull().default({}),
  status: mcpConnectionStatusEnum("status").notNull().default("inactive"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcpConnectionSchema = createInsertSchema(mcpConnectionsTable).omit({ id: true, createdAt: true });
export type InsertMcpConnection = z.infer<typeof insertMcpConnectionSchema>;
export type McpConnection = typeof mcpConnectionsTable.$inferSelect;
