import { AppLayout } from "@/components/layout";
import {
  useListRuns,
  useApproveRun,
  useCancelRun,
  getListRunsQueryKey,
  getGetRunQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  X,
  Clock,
  Box,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useEffect } from "react";

export default function ApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useListRuns({
    status: "awaiting_approval",
    limit: 50,
  });

  const approveRun = useApproveRun();
  const cancelRun = useCancelRun();

  // Poll every 5s for new approval requests
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  const handleApprove = (runId: string) => {
    approveRun.mutate(
      { runId },
      {
        onSuccess: () => {
          toast({ title: "Run approved", description: "Execution will continue." });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
        },
        onError: (err) => {
          toast({ title: "Approval failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleReject = (runId: string) => {
    cancelRun.mutate(
      { runId },
      {
        onSuccess: () => {
          toast({ title: "Run rejected and cancelled" });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
        },
        onError: (err) => {
          toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const pendingRuns = data?.runs ?? [];

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">Approval Queue</h1>
              {pendingRuns.length > 0 && (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-300">
                  {pendingRuns.length} pending
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Review and approve agent tool calls before they execute.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : pendingRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <ShieldAlert className="w-12 h-12 mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground mb-1">No pending approvals</h3>
            <p className="text-sm">
              Agent runs configured with Human-in-the-loop will appear here when they
              need approval to proceed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRuns.map((run) => {
              const waitingSince = run.createdAt
                ? formatDistanceToNow(parseISO(run.createdAt), { addSuffix: true })
                : "unknown";

              return (
                <Card
                  key={run.id}
                  className="border-amber-200 bg-amber-50/30 shadow-sm"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700 bg-amber-100"
                          >
                            Awaiting Approval
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {waitingSince}
                          </span>
                        </div>
                        <CardTitle className="text-base font-mono">
                          <Link
                            href={`/runs/${run.id}`}
                            className="hover:underline text-primary flex items-center gap-1"
                          >
                            {run.id.slice(0, 8)}…{" "}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-0.5">
                          <Box className="w-3 h-3" />
                          <Link
                            href={`/agents/${run.agentId}`}
                            className="hover:underline font-mono text-xs"
                          >
                            Agent {run.agentId.slice(0, 8)}
                          </Link>
                          <span className="mx-1">•</span>
                          <span>Trigger: {run.trigger}</span>
                        </CardDescription>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => handleReject(run.id)}
                          disabled={cancelRun.isPending}
                          data-testid={`button-reject-run-${run.id}`}
                        >
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => handleApprove(run.id)}
                          disabled={approveRun.isPending}
                          data-testid={`button-approve-run-${run.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="text-xs text-muted-foreground grid grid-cols-3 gap-4 bg-white/60 rounded-md p-3 border border-amber-100">
                      <div>
                        <div className="font-semibold text-foreground mb-0.5">Tokens</div>
                        <div>{(run.totalTokens ?? 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground mb-0.5">Cost so far</div>
                        <div>${((run.costCents ?? 0) / 100).toFixed(4)}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground mb-0.5">Input</div>
                        <div className="truncate font-mono">
                          {typeof run.input === "object" && run.input !== null
                            ? JSON.stringify(run.input).slice(0, 60)
                            : String(run.input)}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700 mt-3">
                      This agent is paused and waiting for you to approve or reject the
                      pending tool call(s).{" "}
                      <Link href={`/runs/${run.id}`} className="underline hover:no-underline">
                        View full trace →
                      </Link>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
