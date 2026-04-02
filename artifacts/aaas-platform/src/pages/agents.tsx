import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListAgents } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Box, Search, Plus, Filter, MoreHorizontal, Play, Settings, Archive } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data, isLoading } = useListAgents({ 
    status: statusFilter !== "all" ? statusFilter as any : undefined
  });

  const filteredAgents = data?.agents.filter(agent => 
    agent.name.toLowerCase().includes(search.toLowerCase()) || 
    (agent.description && agent.description.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge className="bg-green-500/10 text-green-700 border-green-200 hover:bg-green-500/20">Active</Badge>;
      case 'paused': return <Badge variant="secondary">Paused</Badge>;
      case 'archived': return <Badge variant="outline" className="text-muted-foreground">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
            <p className="text-muted-foreground">Manage and monitor your autonomous agents.</p>
          </div>
          <Link href="/agents/new">
            <Button data-testid="button-create-agent">
              <Plus className="w-4 h-4 mr-2" />
              New Agent
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search agents..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-agents"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="flex flex-col">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="flex-1">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : filteredAgents?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 border border-border rounded-xl">
            <Box className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">No agents found</h3>
            <p className="text-muted-foreground text-sm mb-4">Get started by creating your first agent.</p>
            <Link href="/agents/new">
              <Button>Create Agent</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredAgents?.map((agent) => (
              <Card key={agent.id} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Box className="w-5 h-5" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Link href={`/agents/${agent.id}`}>
                          <DropdownMenuItem className="cursor-pointer">
                            <Settings className="w-4 h-4 mr-2" /> Configure
                          </DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem className="cursor-pointer">
                          <Archive className="w-4 h-4 mr-2" /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="text-lg line-clamp-1">{agent.name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(agent.status)}
                    <span className="text-xs text-muted-foreground">
                      {agent.model}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 text-sm text-muted-foreground pb-4">
                  <p className="line-clamp-2">
                    {agent.description || "No description provided."}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span>{agent.approvalMode === 'human_in_loop' ? 'Approval req.' : 'Auto-approve'}</span>
                    <span>Updated {formatDistanceToNow(parseISO(agent.updatedAt))} ago</span>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 pb-4 px-4 gap-2">
                  <Link href={`/agents/${agent.id}`} className="w-full">
                    <Button variant="secondary" className="w-full">
                      Manage
                    </Button>
                  </Link>
                  <Button variant="default" size="icon" className="shrink-0" title="Trigger run">
                    <Play className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
