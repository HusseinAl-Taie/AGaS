import { AppLayout } from "@/components/layout";
import { useGetAgent, getGetAgentQueryKey, useListRuns, getListRunsQueryKey } from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Activity, Clock, Zap, Coins } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AgentRunsPage() {
  const [, params] = useRoute("/agents/:id/runs");
  const agentId = params?.id || "";

  const { data: agent, isLoading: isAgentLoading } = useGetAgent(agentId, {
    query: { enabled: !!agentId, queryKey: getGetAgentQueryKey(agentId) }
  });

  const { data: runsData, isLoading: isRunsLoading } = useListRuns(
    { agentId, limit: 100 },
    { query: { enabled: !!agentId, queryKey: getListRunsQueryKey({ agentId, limit: 100 }) } }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-500/10 text-green-700 border-green-200">Completed</Badge>;
      case "failed": return <Badge variant="destructive" className="bg-red-500/10 text-red-700 border-red-200">Failed</Badge>;
      case "running": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Running</Badge>;
      case "awaiting_approval": return <Badge variant="outline" className="border-amber-500 text-amber-600">Awaiting Approval</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      case "budget_exceeded": return <Badge variant="destructive">Budget Exceeded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isAgentLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!agent) {
    return <AppLayout><div className="text-center py-20 text-muted-foreground">Agent not found.</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center text-sm text-muted-foreground">
          <Link href={`/agents/${agentId}`} className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to {agent.name}
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">{agent.name} — Runs</h1>
          <p className="text-muted-foreground mt-1">All execution history for this agent.</p>
        </div>

        {isRunsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !runsData?.runs.length ? (
          <div className="text-center py-20 bg-muted/20 border border-border rounded-xl">
            <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">No runs yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Trigger a run from the agent detail page to get started.</p>
            <Link href={`/agents/${agentId}`}>
              <Button variant="outline">Go to Agent</Button>
            </Link>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead><Zap className="w-3 h-3 inline mr-1" />Tokens</TableHead>
                    <TableHead><Coins className="w-3 h-3 inline mr-1" />Cost</TableHead>
                    <TableHead><Clock className="w-3 h-3 inline mr-1" />Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsData.runs.map((run) => (
                    <TableRow key={run.id} className="hover:bg-muted/30" data-testid={`row-run-${run.id}`}>
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                      <TableCell>
                        <Link href={`/runs/${run.id}`} className="font-mono text-xs text-primary hover:underline">
                          {run.id.slice(0, 12)}...
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{run.trigger}</TableCell>
                      <TableCell className="text-sm">{run.totalTokens.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">${(run.costCents / 100).toFixed(4)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(parseISO(run.createdAt))} ago
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
