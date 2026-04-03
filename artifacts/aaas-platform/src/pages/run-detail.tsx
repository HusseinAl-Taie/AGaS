import { AppLayout } from "@/components/layout";
import { useGetRun, getGetRunQueryKey, useApproveRun, useCancelRun, getListRunsQueryKey } from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Check, X, Box, Terminal, Zap, Coins, Clock, AlertTriangle, Brain, Wrench, CheckCircle2, MessageSquare, RefreshCw, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInSeconds } from "date-fns";
import { useEffect, useRef } from "react";

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

function StepIcon({ type, isError }: { type: RunStep["type"]; isError?: boolean }) {
  switch (type) {
    case "thought": return <Brain className="w-4 h-4 text-blue-500" />;
    case "tool_call": return <Terminal className="w-4 h-4 text-purple-500" />;
    case "tool_result": return isError
      ? <AlertTriangle className="w-4 h-4 text-red-500" />
      : <Wrench className="w-4 h-4 text-green-500" />;
    case "final_answer": return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    default: return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
  }
}

function StepLabel({ type }: { type: RunStep["type"] }) {
  switch (type) {
    case "thought": return "Thought";
    case "tool_call": return "Tool Call";
    case "tool_result": return "Tool Result";
    case "final_answer": return "Final Answer";
    default: return type;
  }
}

function StepCard({ step, index }: { step: RunStep; index: number }) {
  return (
    <AccordionItem value={`step-${index}`} className="border-border">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-center gap-3 text-left w-full">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <StepIcon type={step.type} isError={step.isError} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{StepLabel({ type: step.type })}</span>
              {step.toolName && (
                <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">
                  {step.toolName}
                </Badge>
              )}
              {step.isError && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">error</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-xs">
              {step.content.slice(0, 80)}{step.content.length > 80 ? "…" : ""}
            </span>
          </div>
          <div className="ml-auto shrink-0 text-xs text-muted-foreground">
            {step.tokens ? `${step.tokens} tok` : ""}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className={`rounded-md border p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto ${
          step.type === "thought" ? "bg-blue-500/5 border-blue-200/50" :
          step.type === "tool_call" ? "bg-purple-500/5 border-purple-200/50" :
          step.type === "tool_result" ? (step.isError ? "bg-red-500/5 border-red-200/50" : "bg-green-500/5 border-green-200/50") :
          step.type === "final_answer" ? "bg-emerald-500/5 border-emerald-200/50" :
          "bg-muted"
        }`}>
          {step.content}
        </div>
        {step.toolInput && (
          <div className="mt-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground font-semibold uppercase mb-1">Input</div>
            <pre className="text-xs overflow-x-auto">{JSON.stringify(step.toolInput, null, 2)}</pre>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-2">
          {format(parseISO(step.timestamp), "HH:mm:ss.SSS")}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function RunDetailPage() {
  const [, params] = useRoute("/runs/:id");
  const runId = params?.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: run, isLoading } = useGetRun(runId, {
    query: { enabled: !!runId, queryKey: getGetRunQueryKey(runId) }
  });

  const approveRun = useApproveRun();
  const cancelRun = useCancelRun();

  // Poll for updates when run is active
  useEffect(() => {
    const activeStatuses = ["queued", "running", "awaiting_approval"];
    if (run && activeStatuses.includes(run.status)) {
      pollingRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
      }, 3000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [run?.status, runId, queryClient]);

  const handleApprove = () => {
    approveRun.mutate(
      { runId },
      {
        onSuccess: () => {
          toast({ title: "Run approved", description: "Execution will continue." });
          queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
        }
      }
    );
  };

  const handleCancel = () => {
    cancelRun.mutate(
      { runId },
      {
        onSuccess: () => {
          toast({ title: "Run cancelled" });
          queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'completed': return <Badge className="bg-green-500/10 text-green-700 border-green-200">Completed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'running': return (
        <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Running
        </Badge>
      );
      case 'awaiting_approval': return <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">Requires Approval</Badge>;
      case 'queued': return <Badge variant="outline" className="text-muted-foreground">Queued</Badge>;
      case 'cancelled': return <Badge variant="secondary">Cancelled</Badge>;
      case 'budget_exceeded': return <Badge variant="destructive">Budget Exceeded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!run) return <AppLayout>Run not found</AppLayout>;

  const steps = (run.steps ?? []) as unknown as RunStep[];
  const duration = run.startedAt && run.completedAt
    ? differenceInSeconds(parseISO(run.completedAt), parseISO(run.startedAt))
    : null;

  const finalAnswerStep = steps.find(s => s.type === "final_answer");

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 pb-20">
        <div className="flex items-center text-sm text-muted-foreground">
          <Link href="/runs" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to Runs
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight font-mono">Run {run.id.slice(0,8)}</h1>
              {getStatusBadge(run.status)}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Box className="w-4 h-4" />
              <span>Agent: <Link href={`/agents/${run.agentId}`} className="text-primary hover:underline">{run.agentId}</Link></span>
              <span className="mx-2">•</span>
              <span>Trigger: {run.trigger}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {run.status === 'awaiting_approval' && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 p-2 rounded-lg">
                <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100" onClick={handleCancel} disabled={cancelRun.isPending}>
                  <X className="w-4 h-4 mr-2" /> Reject
                </Button>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleApprove} disabled={approveRun.isPending} data-testid="button-approve-run">
                  <Check className="w-4 h-4 mr-2" /> Approve Action
                </Button>
              </div>
            )}

            {(run.status === 'running' || run.status === 'queued') && (
              <>
                <Link href={`/runs/${run.id}/live`}>
                  <Button variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
                    <Radio className="w-4 h-4 mr-2" /> Live View
                  </Button>
                </Link>
                <Button variant="destructive" onClick={handleCancel} disabled={cancelRun.isPending}>
                  <X className="w-4 h-4 mr-2" /> Cancel Run
                </Button>
              </>
            )}
          </div>
        </div>

        {run.error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">Execution Error</h3>
              <p className="text-sm mt-1">{run.error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Zap className="w-5 h-5 text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">Tokens Used</div>
              <div className="text-xl font-bold">{(run.totalTokens ?? 0).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Coins className="w-5 h-5 text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">Total Cost</div>
              <div className="text-xl font-bold">${((run.costCents ?? 0) / 100).toFixed(4)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Terminal className="w-5 h-5 text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">Steps</div>
              <div className="text-xl font-bold">{steps.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Clock className="w-5 h-5 text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">Duration</div>
              <div className="text-xl font-bold">{duration !== null ? `${duration}s` : '-'}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {finalAnswerStep && (
              <Card className="border-emerald-200 shadow-md">
                <CardHeader className="bg-emerald-500/5 border-b border-emerald-200/50">
                  <CardTitle className="text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Final Answer
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{finalAnswerStep.content}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Execution Trace</CardTitle>
                <CardDescription>Step-by-step reasoning and tool usage</CardDescription>
              </CardHeader>
              <CardContent>
                {steps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {run.status === 'queued' ? 'Waiting to start…' : run.status === 'running' ? 'Executing…' : 'No steps recorded.'}
                  </div>
                ) : (
                  <Accordion
                    type="multiple"
                    defaultValue={steps.map((_, i) => `step-${i}`)}
                    className="w-full"
                  >
                    {steps.map((step, i) => (
                      <StepCard key={i} step={step} index={i} />
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Input</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono">
                  {JSON.stringify(run.input, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-mono">{format(parseISO(run.createdAt), 'HH:mm:ss.SSS')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-mono">{run.startedAt ? format(parseISO(run.startedAt), 'HH:mm:ss.SSS') : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-mono">{run.completedAt ? format(parseISO(run.completedAt), 'HH:mm:ss.SSS') : '-'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
