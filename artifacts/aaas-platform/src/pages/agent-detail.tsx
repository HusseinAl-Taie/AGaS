import { AppLayout } from "@/components/layout";
import { useGetAgent, getGetAgentQueryKey, useUpdateAgent, useListRuns, useTriggerAgentRun, getListRunsQueryKey } from "@workspace/api-client-react";
import { useRoute, useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Box, Play, Clock, Save, Settings, Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function AgentDetailPage() {
  const [, params] = useRoute("/agents/:id");
  const agentId = params?.id || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agent, isLoading } = useGetAgent(agentId, { 
    query: { enabled: !!agentId, queryKey: getGetAgentQueryKey(agentId) } 
  });

  const { data: runs } = useListRuns({ agentId, limit: 10 }, {
    query: { enabled: !!agentId, queryKey: getListRunsQueryKey({ agentId, limit: 10 }) }
  });

  const updateAgent = useUpdateAgent();
  const triggerRun = useTriggerAgentRun();

  // Run dialog state
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runMessage, setRunMessage] = useState("");

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    model: "",
    maxSteps: 15,
    maxBudgetCents: 500,
    approvalMode: "auto",
    status: "active"
  });

  useEffect(() => {
    if (agent) {
      setEditForm({
        name: agent.name,
        description: agent.description || "",
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        maxSteps: agent.maxSteps,
        maxBudgetCents: agent.maxBudgetCents,
        approvalMode: agent.approvalMode,
        status: agent.status
      });
    }
  }, [agent]);

  const handleSave = () => {
    updateAgent.mutate(
      {
        agentId,
        data: {
          ...editForm,
          maxSteps: Number(editForm.maxSteps),
          maxBudgetCents: Number(editForm.maxBudgetCents),
          approvalMode: editForm.approvalMode as "auto" | "human_in_loop",
          status: editForm.status as "active" | "paused" | "archived"
        }
      },
      {
        onSuccess: (data) => {
          toast({ title: "Agent updated successfully" });
          setIsEditing(false);
          queryClient.setQueryData(getGetAgentQueryKey(agentId), data);
        },
        onError: (err) => {
          toast({ title: "Failed to update", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleTrigger = () => {
    triggerRun.mutate(
      { agentId, data: { input: runMessage ? { message: runMessage } : {}, trigger: "manual" } },
      {
        onSuccess: (run) => {
          toast({ title: "Run started", description: "Agent is now executing." });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
          setRunDialogOpen(false);
          setRunMessage("");
          setLocation(`/runs/${run.id}`);
        },
        onError: (err) => {
          toast({ title: "Failed to start run", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge className="bg-green-500/10 text-green-700">Active</Badge>;
      case 'paused': return <Badge variant="secondary">Paused</Badge>;
      case 'archived': return <Badge variant="outline">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getRunStatusBadge = (status: string) => {
    switch(status) {
      case 'completed': return <Badge className="bg-green-500/10 text-green-700">Completed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'running': return <Badge className="bg-blue-500/10 text-blue-700">Running</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!agent) return <AppLayout>Agent not found</AppLayout>;

  return (
    <AppLayout>
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Agent: {agent.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="run-message">Message / Task</Label>
              <Textarea
                id="run-message"
                placeholder="Describe what you want the agent to do…"
                value={runMessage}
                onChange={(e) => setRunMessage(e.target.value)}
                className="min-h-[120px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    e.preventDefault();
                    handleTrigger();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Press ⌘+Enter to run</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleTrigger} disabled={triggerRun.isPending} data-testid="button-confirm-run">
              <Play className="w-4 h-4 mr-2" />
              {triggerRun.isPending ? "Starting…" : "Run Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6">
        <div className="flex items-center text-sm text-muted-foreground">
          <Link href="/agents" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to Agents
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Box className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
                {getStatusBadge(agent.status)}
              </div>
              <p className="text-muted-foreground">{agent.description || "No description"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Settings className="w-4 h-4 mr-2" /> Edit Config
              </Button>
            )}
            <Button onClick={() => setRunDialogOpen(true)} disabled={triggerRun.isPending || agent.status !== 'active'} data-testid="button-trigger-run">
              <Play className="w-4 h-4 mr-2" /> Run Now
            </Button>
          </div>
        </div>

        <Tabs defaultValue="config" className="w-full">
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="runs">Recent Runs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="config" className="mt-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>System Prompt</CardTitle>
                      {isEditing && (
                        <Button size="sm" onClick={handleSave} disabled={updateAgent.isPending}>
                          <Save className="w-4 h-4 mr-2" /> Save
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <Textarea 
                        value={editForm.systemPrompt}
                        onChange={(e) => setEditForm(prev => ({...prev, systemPrompt: e.target.value}))}
                        className="min-h-[300px] font-mono text-sm"
                      />
                    ) : (
                      <div className="bg-muted/50 rounded-md p-4 font-mono text-sm whitespace-pre-wrap">
                        {agent.systemPrompt}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {isEditing && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={editForm.name} onChange={(e) => setEditForm(prev => ({...prev, name: e.target.value}))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={editForm.description} onChange={(e) => setEditForm(prev => ({...prev, description: e.target.value}))} />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Model</Label>
                      {isEditing ? (
                        <Select value={editForm.model} onValueChange={(v) => setEditForm(prev => ({...prev, model: v}))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4 (claude-sonnet-4-6)</SelectItem>
                            <SelectItem value="claude-haiku-4-5">Claude Haiku 4 (claude-haiku-4-5)</SelectItem>
                            <SelectItem value="claude-opus-4-6">Claude Opus 4 (claude-opus-4-6)</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-sm font-medium">{agent.model}</div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Approval Mode</Label>
                      {isEditing ? (
                        <Select value={editForm.approvalMode} onValueChange={(v) => setEditForm(prev => ({...prev, approvalMode: v}))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto-approve</SelectItem>
                            <SelectItem value="human_in_loop">Human-in-the-loop</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-sm font-medium">{agent.approvalMode === 'auto' ? 'Auto-approve' : 'Human-in-the-loop'}</div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      {isEditing ? (
                        <Select value={editForm.status} onValueChange={(v) => setEditForm(prev => ({...prev, status: v}))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div>{getStatusBadge(agent.status)}</div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-border">
                      <div className="flex justify-between items-center mb-2">
                        <Label>Max Steps</Label>
                        {isEditing ? (
                          <Input className="w-20 h-8" type="number" value={editForm.maxSteps} onChange={(e) => setEditForm(prev => ({...prev, maxSteps: Number(e.target.value)}))} />
                        ) : (
                          <span className="text-sm font-medium">{agent.maxSteps}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <Label>Budget Limit</Label>
                        {isEditing ? (
                          <Input className="w-20 h-8" type="number" value={editForm.maxBudgetCents} onChange={(e) => setEditForm(prev => ({...prev, maxBudgetCents: Number(e.target.value)}))} />
                        ) : (
                          <span className="text-sm font-medium">${(agent.maxBudgetCents / 100).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Agent ID</span>
                      <span className="font-mono">{agent.id.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Created</span>
                      <span>{formatDistanceToNow(parseISO(agent.createdAt))} ago</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Updated</span>
                      <span>{formatDistanceToNow(parseISO(agent.updatedAt))} ago</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="runs" className="mt-6">
            <Card>
              <CardContent className="p-0">
                {!runs?.runs.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p>No runs recorded yet.</p>
                    <Button variant="outline" className="mt-4" onClick={handleTrigger} disabled={agent.status !== 'active'}>Trigger First Run</Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {runs.runs.map((run) => (
                      <div key={run.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="mt-1">{getRunStatusBadge(run.status)}</div>
                          <div>
                            <Link href={`/runs/${run.id}`} className="font-medium hover:underline text-primary">
                              {run.id}
                            </Link>
                            <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                              <span><Clock className="w-3 h-3 inline mr-1" />{formatDistanceToNow(parseISO(run.createdAt))} ago</span>
                              <span>Trigger: {run.trigger}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <div>{run.totalTokens.toLocaleString()} tkns</div>
                          <div>${(run.costCents / 100).toFixed(4)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
