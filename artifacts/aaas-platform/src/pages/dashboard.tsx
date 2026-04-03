import {
  useGetUsageAnalytics,
  useGetAgentAnalytics,
  useListRuns,
  getListRunsQueryKey,
  useTriggerAgentRun,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  Coins,
  CheckCircle2,
  Clock,
  Zap,
  Play,
  Box,
  TrendingUp,
  BarChart2,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
          toast({
            title: "Failed to trigger",
            description: err.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-200">
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-700 hover:bg-red-500/20 border-red-200">
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-blue-200">
            Running
          </Badge>
        );
      case "awaiting_approval":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-200">
            Awaiting Approval
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const successRatePct = Math.round((usage?.successRate ?? 0) * 100);

  // Normalize token data for the trend chart (divide by 1000 for readability)
  const trendData = (usage?.days ?? []).map((d) => ({
    date: d.date,
    tokens: Math.round(d.tokens / 1000),
    costCents: d.costCents,
    costDollars: parseFloat((d.costCents / 100).toFixed(4)),
  }));

  const sortedAgents = [...(agentAnalytics?.agents ?? [])].sort(
    (a, b) => b.totalRuns - a.totalRuns
  );

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <Link href="/agents/new">
            <Button data-testid="button-create-agent">
              <Box className="w-4 h-4 mr-2" />
              New Agent
            </Button>
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Runs (14d)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isUsageLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
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
              {isUsageLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{successRatePct}%</div>
                  <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${successRatePct}%` }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isUsageLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
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
              {isUsageLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  ${((usage?.totalCostCents ?? 0) / 100).toFixed(2)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Runs per day — bar chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Runs per Day</CardTitle>
              </div>
              <CardDescription>Daily run volume over the last 14 days</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              {isUsageLoading ? (
                <Skeleton className="h-[260px] w-full" />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={usage?.days ?? []}
                      margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => format(parseISO(val), "MMM d")}
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderRadius: "8px",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        labelFormatter={(val) => format(parseISO(val as string), "MMM d, yyyy")}
                      />
                      <Bar
                        dataKey="runs"
                        name="Runs"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Token & cost trends — dual-axis line chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Token & Cost Trends</CardTitle>
              </div>
              <CardDescription>Tokens (K) and cost ($) over the last 14 days</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              {isUsageLoading ? (
                <Skeleton className="h-[260px] w-full" />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData}
                      margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => format(parseISO(val), "MMM d")}
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="tokens"
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}K`}
                      />
                      <YAxis
                        yAxisId="cost"
                        orientation="right"
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderRadius: "8px",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        labelFormatter={(val) => format(parseISO(val as string), "MMM d, yyyy")}
                        formatter={(value, name) =>
                          name === "Tokens (K)" ? [`${value}K`, name] : [`$${value}`, name]
                        }
                      />
                      <Legend fontSize={11} />
                      <Line
                        yAxisId="tokens"
                        type="monotone"
                        dataKey="tokens"
                        name="Tokens (K)"
                        stroke="hsl(221, 83%, 53%)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="cost"
                        type="monotone"
                        dataKey="costDollars"
                        name="Cost ($)"
                        stroke="hsl(142, 71%, 45%)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Per-agent stats table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Agent Performance</CardTitle>
                <CardDescription>Success rate, cost, and step metrics per agent</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isAgentsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sortedAgents.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No agent runs yet. Create an agent and trigger a run to see stats here.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Success Rate</TableHead>
                    <TableHead className="text-right">Avg Tokens</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead className="text-right">Avg Steps</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents.map((agent) => {
                    const rate = Math.round(agent.successRate * 100);
                    return (
                      <TableRow key={agent.agentId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                              <Box className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="font-medium text-sm">{agent.agentName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{agent.totalRuns}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-sm">{rate}%</span>
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {agent.avgTokens.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          ${(agent.avgCostCents / 100).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {agent.avgSteps.toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleQuickTrigger(agent.agentId)}
                            disabled={triggerRun.isPending}
                            title="Quick trigger"
                            data-testid={`button-quick-trigger-${agent.agentId}`}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Runs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>Latest execution traces across all agents</CardDescription>
              </div>
              <Link href="/runs">
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {isRunsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentRuns?.runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No runs recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentRuns?.runs.map((run) => (
                  <div
                    key={run.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1">{getStatusBadge(run.status)}</div>
                      <div>
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {run.id}
                        </Link>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(parseISO(run.createdAt), { addSuffix: true })}
                          </span>
                          <span>•</span>
                          <span>{run.trigger}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground sm:text-right">
                      <div>
                        <p className="font-medium text-foreground">
                          {run.totalTokens.toLocaleString()}
                        </p>
                        <p>tokens</p>
                      </div>
                      <div className="w-16">
                        <p className="font-medium text-foreground">
                          ${(run.costCents / 100).toFixed(4)}
                        </p>
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
