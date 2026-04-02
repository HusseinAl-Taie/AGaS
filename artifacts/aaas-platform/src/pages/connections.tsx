import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListMcpConnections, useCreateMcpConnection, useDeleteMcpConnection, useTestMcpConnection, getListMcpConnectionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cable, Plus, Trash2, Server, Key, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function ConnectionsPage() {
  const { data, isLoading } = useListMcpConnections();
  const createConnection = useCreateMcpConnection();
  const deleteConnection = useDeleteMcpConnection();
  const testConnection = useTestMcpConnection();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  
  // Form
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [authToken, setAuthToken] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createConnection.mutate(
      {
        data: {
          name,
          serverUrl,
          authConfig: authToken ? { token: authToken } : undefined
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Connection added successfully" });
          setIsDialogOpen(false);
          setName("");
          setServerUrl("");
          setAuthToken("");
          queryClient.invalidateQueries({ queryKey: getListMcpConnectionsQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Failed to add connection", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to remove this connection? Agents using its tools may fail.")) {
      deleteConnection.mutate(
        { connectionId: id },
        {
          onSuccess: () => {
            toast({ title: "Connection removed" });
            queryClient.invalidateQueries({ queryKey: getListMcpConnectionsQueryKey() });
          }
        }
      );
    }
  };

  const handleTest = (id: string) => {
    setTestingId(id);
    testConnection.mutate(
      { connectionId: id },
      {
        onSuccess: (result) => {
          setTestingId(null);
          setTestResults(prev => ({ ...prev, [id]: result }));
          if (result.success) {
            toast({ title: "Connection successful", description: `Discovered ${result.tools.length} tools.` });
          } else {
            toast({ title: "Connection failed", description: result.error || "Unknown error", variant: "destructive" });
          }
        },
        onError: (err) => {
          setTestingId(null);
          toast({ title: "Test failed", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge className="bg-green-500/10 text-green-700 border-green-200">Active</Badge>;
      case 'inactive': return <Badge variant="secondary">Inactive</Badge>;
      case 'error': return <Badge variant="destructive">Error</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">MCP Connections</h1>
            <p className="text-muted-foreground">Connect your agents to external systems via Model Context Protocol.</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add MCP Server</DialogTitle>
                  <DialogDescription>Connect to an external service that implements the Model Context Protocol.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Connection Name</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Internal Database" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url">Server URL</Label>
                    <Input id="url" type="url" value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="https://api.example.com/mcp" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="token">Auth Token (Optional)</Label>
                    <Input id="token" type="password" value={authToken} onChange={e => setAuthToken(e.target.value)} placeholder="Bearer token or API key" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createConnection.isPending}>
                    {createConnection.isPending ? "Adding..." : "Add Connection"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map(i => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
                <CardContent><Skeleton className="h-16 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        ) : data?.connections.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 border border-border rounded-xl">
            <Cable className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">No connections</h3>
            <p className="text-muted-foreground text-sm mb-4">Connect to MCP servers to give your agents real-world capabilities.</p>
            <Button onClick={() => setIsDialogOpen(true)}>Add your first connection</Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {data?.connections.map((conn) => (
              <Card key={conn.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{conn.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          {getStatusBadge(conn.status)}
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[150px]">{conn.serverUrl}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(conn.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 py-2">
                  {testResults[conn.id] ? (
                    <div className={`p-3 rounded-md border text-sm ${testResults[conn.id].success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      {testResults[conn.id].success ? (
                        <div>
                          <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                            <CheckCircle2 className="w-4 h-4" /> Connection successful
                          </div>
                          <p className="text-green-800 text-xs mb-2">Discovered {testResults[conn.id].tools?.length || 0} tools:</p>
                          <div className="flex flex-wrap gap-1">
                            {testResults[conn.id].tools?.slice(0, 5).map((t: any) => (
                              <Badge variant="outline" key={t.name} className="bg-white/50 text-green-800 border-green-300">{t.name}</Badge>
                            ))}
                            {(testResults[conn.id].tools?.length || 0) > 5 && (
                              <Badge variant="outline" className="bg-white/50 text-green-800 border-green-300">+{testResults[conn.id].tools.length - 5} more</Badge>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
                            <AlertCircle className="w-4 h-4" /> Connection failed
                          </div>
                          <p className="text-red-800 text-xs break-all">{testResults[conn.id].error}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p>Added {formatDistanceToNow(parseISO(conn.createdAt))} ago</p>
                    </div>
                  )}
                </CardContent>
                
                <CardFooter className="pt-2 pb-4">
                  <Button 
                    variant="secondary" 
                    className="w-full" 
                    onClick={() => handleTest(conn.id)}
                    disabled={testingId === conn.id}
                  >
                    {testingId === conn.id ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                    ) : (
                      <><Cable className="w-4 h-4 mr-2" /> Test Connection</>
                    )}
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
