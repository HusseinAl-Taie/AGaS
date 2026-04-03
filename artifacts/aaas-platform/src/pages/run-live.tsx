import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { useGetRun, useCancelRun, getGetRunQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  StopCircle,
  ChevronRight,
  Wrench,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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

interface StreamEvent {
  type: "step" | "status" | "done" | "error";
  payload: Record<string, unknown>;
}

const stepIcon = (type: RunStep["type"], isError?: boolean) => {
  if (type === "thought") return <ChevronRight className="w-4 h-4 text-muted-foreground" />;
  if (type === "tool_call") return <Wrench className="w-4 h-4 text-blue-500" />;
  if (type === "tool_result") return isError
    ? <AlertCircle className="w-4 h-4 text-red-500" />
    : <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (type === "final_answer") return <FileText className="w-4 h-4 text-purple-500" />;
  return null;
};

const stepLabel = (type: RunStep["type"]) => {
  switch (type) {
    case "thought": return "Thinking";
    case "tool_call": return "Tool Call";
    case "tool_result": return "Tool Result";
    case "final_answer": return "Final Answer";
    default: return type;
  }
};

export default function RunLivePage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: runData } = useGetRun(runId);
  const cancelRun = useCancelRun();

  const [steps, setSteps] = useState<RunStep[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Seed steps from initial DB data
  useEffect(() => {
    if (runData && Array.isArray((runData as unknown as { steps?: RunStep[] }).steps)) {
      const dbSteps = (runData as unknown as { steps: RunStep[] }).steps;
      setSteps(dbSteps);
      setStatus(runData.status);
      const terminalStatuses = ["completed", "failed", "cancelled", "budget_exceeded"];
      if (terminalStatuses.includes(runData.status)) {
        setDone(true);
      }
    }
  }, [runData]);

  // Connect to SSE stream
  useEffect(() => {
    if (done) return;

    const url = `/api/runs/${runId}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data as string);

        if (event.type === "step") {
          const step = event.payload.step as RunStep;
          if (step) {
            setSteps((prev) => {
              // Deduplicate by timestamp + type + content (content distinguishes steps at the same ms)
              const key = `${step.timestamp}:${step.type}:${step.content?.slice(0, 60)}`;
              if (prev.some((s) => `${s.timestamp}:${s.type}:${s.content?.slice(0, 60)}` === key)) {
                return prev;
              }
              return [...prev, step];
            });
          }
        } else if (event.type === "status" || event.type === "done") {
          const newStatus = event.payload.status as string;
          if (newStatus) setStatus(newStatus);
          if (event.type === "done") {
            setDone(true);
            queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
            es.close();
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects, don't close
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId, done, queryClient]);

  // Auto-scroll to bottom as new steps arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  const handleCancel = () => {
    cancelRun.mutate(
      { runId },
      {
        onSuccess: () => {
          toast({ title: "Run cancelled" });
          setStatus("cancelled");
          setDone(true);
          esRef.current?.close();
        },
        onError: (err) => {
          toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "completed": return <Badge className="bg-green-500/10 text-green-700 border-green-200">Completed</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "running": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Running</Badge>;
      case "awaiting_approval": return <Badge variant="outline" className="border-amber-500 text-amber-600">Awaiting Approval</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      case "budget_exceeded": return <Badge variant="destructive">Budget Exceeded</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                Live: {runId.slice(0, 8)}
              </h1>
              {getStatusBadge(status)}
              {!done && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {connected
                    ? <><Loader2 className="w-3 h-3 animate-spin text-blue-500" /> Streaming</>
                    : <><Loader2 className="w-3 h-3 animate-spin text-amber-500" /> Connecting…</>}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Real-time agent execution trace.{" "}
              <Link href={`/runs/${runId}`} className="text-primary hover:underline inline-flex items-center gap-1">
                View full detail <ExternalLink className="w-3 h-3" />
              </Link>
            </p>
          </div>

          <div className="flex gap-2">
            {!done && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={cancelRun.isPending}
              >
                <StopCircle className="w-4 h-4 mr-1" /> Cancel
              </Button>
            )}
            {done && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/runs/${runId}`)}>
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
            )}
          </div>
        </div>

        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Execution Trace ({steps.length} steps)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-280px)] pr-4">
              {steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 opacity-40" />
                  <p>Waiting for first step…</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-3 p-3 rounded-lg border text-sm",
                        step.type === "final_answer"
                          ? "border-purple-200 bg-purple-50/50"
                          : step.type === "tool_call"
                            ? "border-blue-100 bg-blue-50/30"
                            : step.isError
                              ? "border-red-100 bg-red-50/20"
                              : "border-border bg-card"
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {stepIcon(step.type, step.isError)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                            {stepLabel(step.type)}
                          </span>
                          {step.toolName && (
                            <Badge variant="secondary" className="text-xs py-0">
                              {step.toolName}
                            </Badge>
                          )}
                        </div>
                        <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {step.content}
                        </p>
                        {step.toolInput && (
                          <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-auto">
                            {JSON.stringify(step.toolInput, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}

                  {!done && (
                    <div className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Agent is thinking…</span>
                    </div>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
