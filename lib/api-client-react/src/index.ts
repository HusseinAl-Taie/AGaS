// NOTE: The SSE stream endpoint (GET /api/runs/:runId/stream) must be consumed via the
// native browser EventSource API. The streamRun/useStreamRun React Query hooks are
// excluded from codegen (orval skip: true). Use getStreamRunUrl() below instead.
// Usage: new EventSource(getStreamRunUrl(runId))
import { getBaseUrl } from "./custom-fetch";
export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  customFetch,
  getBaseUrl,
} from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

/** Returns the SSE URL for a run. Consume with native EventSource, not React Query. */
export function getStreamRunUrl(runId: string): string {
  return `${getBaseUrl()}/runs/${runId}/stream`;
}
