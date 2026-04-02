import { AppLayout } from "@/components/layout";
import { useGetRun, getGetRunQueryKey, useApproveRun, useCancelRun, getListRunsQueryKey } from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Check, X, Box, Terminal, Zap, Coins, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInSeconds } from "date-fns";

export default function RunDetailPage() {
  const [, params] = useRoute("/runs/:id");
  const runId = params?.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: run, isLoading } = useGetRun(runId, { 
    query: { enabled: !!runId, queryKey: getGetRunQueryKey(runId) } 
  });

  const approveRun = useApproveRun();
  const cancelRun = useCancelRun();

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
      case 'completed': return <Badge className="bg-green-500/10 text-green-700">Completed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'running': return <Badge className="bg-blue-500/10 text-blue-700 animate-pulse">Running</Badge>;
      case 'awaiting_approval': return <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">Requires Approval</Badge>;
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

  const duration = run.startedAt && run.completedAt 
    ? differenceInSeconds(parseISO(run.completedAt), parseISO(run.startedAt))
    : null;

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
              <span>Agent: <Link href={`/agents/${run.agentId}`} className="text-primary hover:underline">{run.agent?.name || run.agentId}</Link></span>
              <span className="mx-2">•</span>
              <span>Trigger: {run.trigger}</span>
            </div>
          </div>

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
          
          {run.status === 'running' && (
            <Button variant="destructive" onClick={handleCancel} disabled={cancelRun.isPending}>
              <X className="w-4 h-4 mr-2" /> Cancel Run
            </Button>
          )}
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
              <div className="text-xl font-bold">{run.totalTokens.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Coins className="w-5 h-5 text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">Total Cost</div>
              <div className="text-xl font-bold">${(run.costCents / 100).toFixed(4)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Terminal className="w-5 h-5 text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">Steps</div>
              <div className="text-xl font-bold">{run.steps?.length || 0}</div>
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
            <Card>
              <CardHeader>
                <CardTitle>Execution Trace</CardTitle>
                <CardDescription>Step-by-step reasoning and tool usage</CardDescription>
              </CardHeader>
              <CardContent>
                {!run.steps || run.steps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No steps recorded yet.</div>
                ) : (
                  <Accordion type="multiple" defaultValue={["step-1"]} className="w-full">
                    {run.steps.map((step) => (
                      <AccordionItem key={step.stepNumber} value={`step-${step.stepNumber}`} className="border-border">
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-3 text-left">
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                              {step.stepNumber}
                            </div>
                            <span className="font-semibold">Step {step.stepNumber}</span>
                            <span className="text-xs text-muted-foreground font-normal ml-2">{step.tokensUsed} tokens</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 space-y-4">
                          {step.thought && (
                            <div className="bg-muted/30 p-4 rounded-md border border-border/50">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Thought</h4>
                              <div className="text-sm font-mono whitespace-pre-wrap text-foreground/90">{step.thought}</div>
                            </div>
                          )}
                          
                          {step.toolCalls && step.toolCalls.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tool Calls</h4>
                              {step.toolCalls.map((call, idx) => {
                                const c = call as Record<string, unknown>;
                                return (
                                  <div key={idx} className="border border-border rounded-md overflow-hidden">
                                    <div className="bg-muted px-3 py-2 text-sm font-mono font-semibold flex items-center gap-2 border-b border-border">
                                      <Terminal className="w-4 h-4 text-primary" />
                                      {String(c.name ?? "unknown_tool")}
                                    </div>
                                    <div className="p-3 bg-background">
                                      <pre className="text-xs text-muted-foreground overflow-x-auto">
                                        {JSON.stringify(c.arguments ?? c.args ?? {}, null, 2)}
                                      </pre>
                                    </div>
                                    {step.toolResults && step.toolResults[idx] !== undefined && (
                                      <div className="p-3 bg-green-500/5 border-t border-border">
                                        <div className="text-xs font-semibold text-green-700 mb-1">Result:</div>
                                        <pre className="text-xs text-green-900/80 overflow-x-auto max-h-40 overflow-y-auto">
                                          {JSON.stringify(step.toolResults[idx], null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>

            {run.output && (
              <Card className="border-primary/20 shadow-md">
                <CardHeader className="bg-primary/5 border-b border-primary/10">
                  <CardTitle className="text-primary flex items-center gap-2">
                    <Check className="w-5 h-5" /> Final Output
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <pre className="whitespace-pre-wrap font-mono text-sm overflow-auto">
                    {typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
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
