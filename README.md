# AGaS — Agentic as a Service

A production-ready, multi-tenant platform for creating, managing, and monitoring AI agents powered by Anthropic Claude. AGaS provides a full SaaS layer on top of Claude's tool-use API, with real-time streaming, webhooks, cron scheduling, MCP tool connections, and analytics.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  React / Vite SPA               │
│  Dashboard · Agents · Runs · Schedules ·        │
│  Approvals · Connections · Settings             │
└────────────────────┬────────────────────────────┘
                     │ REST + SSE
┌────────────────────▼────────────────────────────┐
│             Express 5 API Server                │
│  Auth (Clerk) · CRUD · AgentRunner              │
│  BullMQ · Redis Pub/Sub · Scheduler             │
└──────┬─────────────┬───────────────┬────────────┘
       │             │               │
  PostgreSQL      Redis         Anthropic API
  (Drizzle ORM)  (BullMQ +     (Claude Sonnet /
                  Pub/Sub)      Haiku / Opus)
```

### Monorepo Layout

```
.
├── artifacts/
│   ├── aaas-platform/          # React + Vite frontend
│   └── api-server/             # Express 5 backend
├── lib/
│   ├── db/                     # Drizzle ORM schema + migrations
│   ├── api-spec/               # OpenAPI 3.1 spec + orval codegen config
│   ├── api-client-react/       # Generated React Query hooks
│   └── api-zod/                # Generated Zod validators
└── scripts/                    # Shared utilities
```

---

## Feature Set

### Multi-Tenant Auth
- **Clerk** handles sign-up / sign-in (JWT sessions)
- Per-tenant isolation — every DB row carries `tenantId`
- API key auth for server-to-server calls (hashed with bcrypt)
- Role-based: `owner`, `admin`, `member`

### Agent Management
- Create agents with custom system prompts, model selection, and tool configs
- **Models**: `claude-sonnet-4` · `claude-haiku-4` · `claude-opus-4`
- **Approval modes**: fully autonomous or Human-in-the-Loop (HITL)
- Per-agent budget caps (max steps + max cost in cents)
- 5 built-in starter templates:
  - Email Triage · Code Reviewer · Data Summariser · Incident Responder · Content Drafter

### Agent Runner (Claude Tool Loop)
- Full tool-use loop using the Anthropic Messages API
- Emits granular step events: `thought` → `tool_call` → `tool_result` → `final_answer`
- Budget enforcement (token count + cost ceiling)
- Cancellation support — cancel mid-run via API; worker detects and stops cleanly
- HITL pause — emits `approval.required` event and waits for human approval before continuing

### Real-Time Streaming (SSE)
- `GET /api/runs/:runId/stream` — Server-Sent Events endpoint
- Redis Pub/Sub fan-out from AgentRunner → SSE clients
- Heartbeat keepalive (15 s) through proxies
- Terminal + paused status fast-path on initial connect
- Live Run Monitor UI (`/runs/:id/live`) with step-by-step trace

### Webhooks
- Register webhooks per agent and event type (`run.completed`, `run.failed`, `approval.required`, `run.cancelled`)
- **HMAC-SHA256** signing — `X-AaaS-Signature` header on every delivery
- BullMQ delivery queue with 5-attempt **exponential backoff**
- **SSRF guard** — blocks private IPs and DNS-resolved private ranges
- Secret rotation button in Settings UI
- Startup backfill for legacy webhooks with empty signing secrets

### Cron Scheduling
- Create schedules with any valid cron expression (e.g. `0 9 * * 1-5`)
- `nextRunAt` computed with `cron-parser` and persisted to DB
- In-process `node-cron` scheduler with enable/disable/delete sync
- `SCHEDULER_ENABLED=false` env var for multi-replica deployments
- Full schedule management UI: create · edit · toggle · delete

### MCP Tool Connections
- Connect agents to any MCP-compatible tool server
- Store per-connection auth config (JWT, API key, etc.)
- Status tracking (`connected` / `error` / `pending`)

### Analytics
- `GET /api/analytics/usage` — daily aggregates: runs, tokens, cost, success rate
- `GET /api/analytics/agents` — per-agent: total runs, success rate, avg cost, avg steps
- Dashboard charts powered by **Recharts**: area chart, bar chart, stat cards
- Configurable time window (`?days=7|14|30`)

### Rate Limiting
- Per-tenant concurrent run limits: **free → 5**, **pro → 50**, **enterprise → unlimited**
- Returns `429 Too Many Requests` with a clear message when the limit is hit
- Checked atomically against active `running` / `queued` rows before enqueuing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Express 5, TypeScript, Zod |
| Auth | Clerk (JWT) + bcrypt API keys |
| Database | PostgreSQL + Drizzle ORM |
| Queue | BullMQ (Redis) |
| Streaming | Redis Pub/Sub + SSE |
| Scheduling | node-cron + cron-parser |
| AI | Anthropic Claude (tool-use API) |
| Codegen | orval (React Query + Zod from OpenAPI 3.1) |
| Package manager | pnpm workspaces |

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Redis 7+

### Environment Variables

Create `.env` files or set secrets in your deployment environment:

```env
# API Server
DATABASE_URL=postgresql://user:pass@localhost:5432/agas
REDIS_URL=redis://localhost:6379
CLERK_SECRET_KEY=sk_...
ANTHROPIC_API_KEY=sk-ant-...
PORT=8080

# Optional
SCHEDULER_ENABLED=true        # Set false on replica instances
```

```env
# Frontend
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

### Running Locally

```bash
# Install dependencies
pnpm install

# Push DB schema
pnpm --filter @workspace/db run push

# Start API server (also starts Redis)
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/aaas-platform run dev
```

### Codegen (after OpenAPI spec changes)

```bash
cd lib/api-spec
pnpm run codegen

# Rebuild the generated client
npx tsc -p lib/api-client-react/tsconfig.json
```

### TypeScript Check (all packages)

```bash
pnpm run typecheck
```

---

## API Reference

Base URL: `https://<your-domain>/api`

Authentication: `Authorization: Bearer <clerk-jwt>` or `x-api-key: <tenant-api-key>`

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/auth/me` | Current user + tenant info |
| POST | `/auth/rotate-api-key` | Generate new tenant API key |
| GET | `/agents` | List agents |
| POST | `/agents` | Create agent |
| GET | `/agents/:id` | Get agent detail |
| PUT | `/agents/:id` | Update agent |
| DELETE | `/agents/:id` | Delete agent |
| POST | `/agents/:id/trigger` | Trigger a run |
| GET | `/runs` | List runs |
| GET | `/runs/:id` | Run detail + steps |
| GET | `/runs/:id/stream` | SSE stream (EventSource only) |
| POST | `/runs/:id/cancel` | Cancel in-progress run |
| POST | `/runs/:id/approve` | Approve HITL pause |
| GET | `/analytics/usage` | Daily usage stats (`?days=30`) |
| GET | `/analytics/agents` | Per-agent performance stats |
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Create webhook |
| PUT | `/webhooks/:id` | Update webhook / rotate secret |
| DELETE | `/webhooks/:id` | Delete webhook |
| GET | `/schedules` | List schedules |
| POST | `/schedules` | Create schedule |
| PUT | `/schedules/:id` | Update / toggle schedule |
| DELETE | `/schedules/:id` | Delete schedule |
| GET | `/mcp-connections` | List MCP connections |
| POST | `/mcp-connections` | Create MCP connection |

### Webhook Payload

Every webhook delivery includes:

```http
POST <your-url>
Content-Type: application/json
X-AaaS-Event: run.completed
X-AaaS-Signature: sha256=<hmac-hex>

{
  "event": "run.completed",
  "runId": "...",
  "agentId": "...",
  "tenantId": "...",
  "status": "completed",
  "output": { ... }
}
```

Verify the signature:

```typescript
import { createHmac } from "crypto";

function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}
```

### SSE Stream Events

Connect with `new EventSource("/api/runs/:runId/stream")`:

```typescript
// Step event
{ type: "step", payload: { step: { type, content, toolName, timestamp, ... } } }

// Status change
{ type: "status", payload: { status: "awaiting_approval" } }

// Terminal
{ type: "done", payload: { status: "completed" | "failed" | "cancelled", output?, error? } }
```

---

## Database Schema

```
tenants          — id, name, plan (free/pro/enterprise), apiKeyHash, settings
users            — id, tenantId, clerkUserId, email, role
agents           — id, tenantId, name, systemPrompt, model, tools, approvalMode, maxSteps, maxBudgetCents
agent_runs       — id, agentId, tenantId, status, input, output, steps (JSONB), totalTokens, costCents
mcp_connections  — id, tenantId, name, serverUrl, authConfig, status
webhooks         — id, tenantId, agentId, url, events[], signingSecret
scheduled_triggers — id, agentId, tenantId, cronExpression, enabled, nextRunAt, inputTemplate
```

---

## Development Notes

- **HITL approval**: Run enters `awaiting_approval` status; SSE emits `status` event and closes. Client polls or reconnects after approval.
- **Scheduler multi-instance**: Set `SCHEDULER_ENABLED=false` on secondary replicas to avoid duplicate cron fires.
- **Webhook secrets**: Rotate via Settings → Webhooks → rotate icon. New secret shown once in toast.
- **Rate limits**: Free tenants capped at 5 concurrent active runs; Pro at 50. Returns HTTP 429 on breach.
- **SSE note**: The `/runs/:id/stream` endpoint must be consumed with the native `EventSource` API — not a fetch/React Query hook.

---

## License

MIT
