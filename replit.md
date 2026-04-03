# Workspace

## Overview

AaaS (Agentic as a Service) platform — a full-stack SaaS tool where developers and ops teams create, configure, and monitor autonomous AI agents. Built as a pnpm monorepo with TypeScript throughout.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, wouter routing, shadcn/ui, Tailwind CSS, recharts
- **Auth**: Clerk (multi-tenant, cookie-based sessions)

## Architecture

```
artifacts/
  api-server/        - Express 5 API server (port from env PORT)
  aaas-platform/     - React/Vite frontend (port 20501)
lib/
  api-spec/          - OpenAPI spec (openapi.yaml) — source of truth
  api-client-react/  - Orval-generated React Query hooks
  api-zod/           - Orval-generated Zod validation schemas
  db/                - Drizzle ORM schema + client
```

## Database Schema

- `tenants` — Organizations/workspaces (id, name, plan, apiKeyHash, settings)
- `users` — Users linked to tenants via Clerk userId (id, tenantId, clerkUserId, email, role)
- `agents` — AI agent configs (name, systemPrompt, model, tools, maxSteps, maxBudgetCents, approvalMode, status)
- `agent_runs` — Individual run records (agentId, trigger, input, status, steps, tokens, cost)
- `mcp_connections` — MCP tool server connections (name, serverUrl, apiKey, status)
- `webhooks` — Webhook endpoints per agent (url, events[])
- `scheduled_triggers` — Cron schedules per agent (cronExpression, inputTemplate, enabled)

## API Routes

- `GET /api/health` — health check
- `GET /api/auth/me` — get current user + tenant
- `POST /api/auth/onboard` — create tenant+user on first login
- `GET/POST /api/agents` — list/create agents
- `GET/PUT/DELETE /api/agents/:id` — agent CRUD
- `POST /api/agents/:id/runs` — trigger agent run
- `GET /api/runs` — list all runs (with filtering)
- `GET /api/runs/:id` — get run detail
- `POST /api/runs/:id/approve` — approve human-in-loop run
- `POST /api/runs/:id/cancel` — cancel run
- `GET/POST /api/mcp-connections` — list/create MCP connections
- `DELETE /api/mcp-connections/:id` — delete connection
- `POST /api/mcp-connections/:id/test` — test connection
- `GET/POST /api/webhooks` — list/create webhooks
- `DELETE /api/webhooks/:id` — delete webhook
- `GET/POST /api/schedules` — list/create schedules
- `PUT/DELETE /api/schedules/:id` — update/delete schedule
- `GET /api/analytics/usage` — usage analytics (daily breakdown)
- `GET /api/analytics/agents` — per-agent analytics

## Frontend Pages

- `/` — Landing page (redirects signed-in users to /dashboard)
- `/sign-in`, `/sign-up` — Clerk auth pages
- `/onboard` — Workspace setup for new users
- `/dashboard` — Overview with recharts, recent runs, stats
- `/agents` — Agent list with status badges and search
- `/agents/new` — Agent creation wizard with 5 starter templates
- `/agents/:id` — Agent detail with edit-in-place
- `/runs` — All runs with status/agent filtering
- `/runs/:id` — Run detail with step-by-step execution trace
- `/connections` — MCP connection management
- `/settings` — Tenant settings + webhooks management

## Multi-tenancy

- All API routes filter by `tenant_id` derived from Clerk session — never from client
- New users POST /api/auth/onboard to create their tenant workspace
- If GET /api/auth/me returns 403, user is redirected to /onboard

## Agent Execution Engine (Phase 2)

- **AgentRunner** (`artifacts/api-server/src/worker/agentRunner.ts`) — Claude agentic loop with:
  - Multi-turn messages accumulation
  - MCP tool discovery + execution via JSON-RPC
  - Budget tracking in cents with automatic `budget_exceeded` status
  - Human-in-loop support (pauses at tool calls, saves pending state to DB, resumes on approve)
  - Cancellation detection on each loop iteration
  - Step trace stored as JSONB: `{ type, content, toolName, toolInput, toolCallId, isError, tokens, timestamp }`
- **MCP Client** (`artifacts/api-server/src/worker/mcpClient.ts`) — JSON-RPC 2.0 client for MCP servers
- **Queue** (`artifacts/api-server/src/lib/queue.ts`) — BullMQ job queue backed by Redis
  - Redis started via `redis-server --daemonize yes` in the dev script
  - One BullMQ worker running in-process (concurrency: 5)
- **Models**: `claude-sonnet-4-6` (default), `claude-haiku-4-5`, `claude-opus-4-6` via Replit AI Integrations
- **New env vars**: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `REDIS_URL` (optional, defaults to `redis://localhost:6379`)

## Run Detail Page Updates

- Step trace accordion replaced with new format matching `RunStep` interface
- Live polling every 3s for active runs (queued/running/awaiting_approval)
- Final answer prominently shown above the trace
- Approve + Cancel buttons contextual to run status

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## GitHub Repository

The project is hosted at: https://github.com/HusseinAl-Taie/AGaS

To push future changes:
```bash
git remote add github "https://$GITHUB_TOKEN@github.com/HusseinAl-Taie/AGaS.git"
git push github main
git remote remove github   # remove token from config after push
```

NOTE: The Replit GitHub OAuth integration was declined. A Personal Access Token stored as `GITHUB_TOKEN` secret is used instead for repository operations.
