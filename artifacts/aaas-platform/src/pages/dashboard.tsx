import { useGetUsageAnalytics, useGetAgentAnalytics, useListRuns, getListRunsQueryKey, useTriggerAgentRun } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Coins, CheckCircle2, XCircle, Clock, Zap, Play, Box } from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: usage, isLoading: isUsageLoading } = useGetUsageAnalytics({ days: 14 });
  const { data: agentAnalytics, isLoading: isAgentsLoading } = useGetAgentAnalytics();
  const { data: recentRuns, isLoading: isRunsLoading } = useListRuns({ limit: 5 });
  const triggerRun = useTriggerAgentRun();

  const handleQuickTrigger = (agentId: string) => {
    triggerRun.mutate(
      { agentId, data: { input: {}, trigger: "manual" } },
      {
        onSuccess: (run) => {
          toast({ title: "Agent triggered", description: "Run started successfully." });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
          setLocation(`/runs/${run.id}`);
        },
        onError: (err) => {
          toast({ title: "Failed to trigger", description: err.error || "An error occurred", variant: "destructive" });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'completed': return <Badge variant="default" className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-200">Completed</Badge>;
      case 'failed': return <Badge variant="destructive" className="bg-red-500/10 text-red-700 hover:bg-red-500/20 border-red-200">Failed</Badge>;
      case 'running': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-blue-200">Running</Badge>;
      case 'awaiting_approval': return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-200">Awaiting Approval</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex gap-2">
            <Link href="/agents/new">
              <Button data-testid="button-create-agent">
                <Box className="w-4 h-4 mr-2" />
                New Agent
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Runs (14d)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isUsageLoading ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-2xl font-bold">{usage?.totalRuns.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isUsageLoading ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-2xl font-bold">{(usage?.successRate || 0) * 100}%</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isUsageLoading ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-2xl font-bold">{usage?.totalTokens.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isUsageLoading ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-2xl font-bold">${((usage?.totalCostCents || 0) / 100).toFixed(2)}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle>Activity Overview</CardTitle>
              <CardDescription>Run volume over the last 14 days</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              {isUsageLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usage?.days || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRuns" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => format(parseISO(val), 'MMM d')}
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <YAxis 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => `${value}`} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                        labelFormatter={(val) => format(parseISO(val as string), 'MMM d, yyyy')}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="runs" 
                        stroke="hsl(var(--primary))" 
                        fillOpacity={1} 
                        fill="url(#colorRuns)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Top Agents</CardTitle>
              <CardDescription>Most active agents</CardDescription>
            </CardHeader>
            <CardContent>
              {isAgentsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : agentAnalytics?.agents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No agents run yet</div>
              ) : (
                <div className="space-y-6">
                  {agentAnalytics?.agents.slice(0, 5).map((agent) => (
                    <div key={agent.agentId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <Box className="w-4 h-4" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-medium truncate">{agent.agentName}</p>
                          <p className="text-xs text-muted-foreground">{agent.totalRuns} runs</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          onClick={() => handleQuickTrigger(agent.agentId)}
                          disabled={triggerRun.isPending}
                          title="Trigger Run"
                          data-testid={`button-quick-trigger-${agent.agentId}`}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>Latest execution traces across all agents</CardDescription>
              </div>
              <Link href="/runs">
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {isRunsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : recentRuns?.runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No runs recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentRuns?.runs.map((run) => (
                  <div key={run.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">{getStatusBadge(run.status)}</div>
                      <div>
                        <Link href={`/runs/${run.id}`} className="text-sm font-medium hover:underline flex items-center gap-2">
                          {run.id}
                        </Link>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDistanceToNow(parseISO(run.createdAt), { addSuffix: true })}</span>
                          <span>•</span>
                          <span>{run.trigger}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground sm:text-right">
                      <div>
                        <p className="font-medium text-foreground">{run.totalTokens.toLocaleString()}</p>
                        <p>tokens</p>
                      </div>
                      <div className="w-16">
                        <p className="font-medium text-foreground">${(run.costCents / 100).toFixed(4)}</p>
                        <p>cost</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
