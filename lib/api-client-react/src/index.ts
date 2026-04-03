// NOTE: The `streamRun` / `useStreamRun` exports are included here from the generated
// client but should NOT be used — the endpoint returns text/event-stream (SSE) which
// requires the native EventSource API, not a React Query fetch hook.
// Usage: new EventSource(`${BASE_URL}api/runs/${runId}/stream`)
export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, customFetch } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
