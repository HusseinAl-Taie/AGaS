// NOTE: The SSE stream endpoint (GET /api/runs/:runId/stream) must be consumed via the
// native browser EventSource API. The streamRun/useStreamRun React Query hooks have been
// intentionally removed from the generated output. Only getStreamRunUrl is exported for
// convenience. Usage: new EventSource(getStreamRunUrl(runId))
export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, customFetch } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
