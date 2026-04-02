import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListRuns } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Filter, Clock, Box, Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function RunsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data, isLoading } = useListRuns({ 
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    limit: 50
  });

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'completed': return <Badge className="bg-green-500/10 text-green-700 border-green-200">Completed</Badge>;
      case 'failed': return <Badge variant="destructive" className="bg-red-500/10 text-red-700 border-red-200">Failed</Badge>;
      case 'running': return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Running</Badge>;
      case 'awaiting_approval': return <Badge variant="outline" className="border-amber-500 text-amber-600">Need Approval</Badge>;
      case 'cancelled': return <Badge variant="secondary">Cancelled</Badge>;
      case 'budget_exceeded': return <Badge variant="destructive">Budget Exceeded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Runs</h1>
            <p className="text-muted-foreground">Execution history across all agents.</p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
                <SelectItem value="budget_exceeded">Budget Exceeded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : data?.runs.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-foreground mb-1">No runs found</h3>
                <p>No executions match your current filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Agent ID</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                      <TableCell>
                        <Link href={`/runs/${run.id}`} className="font-mono text-primary hover:underline">
                          {run.id.slice(0, 8)}...
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/agents/${run.agentId}`} className="flex items-center gap-2 hover:underline">
                          <Box className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-xs">{run.agentId.slice(0, 8)}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{run.trigger}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{run.totalTokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${(run.costCents / 100).toFixed(4)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {run.startedAt ? formatDistanceToNow(parseISO(run.startedAt), { addSuffix: true }) : '-'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
