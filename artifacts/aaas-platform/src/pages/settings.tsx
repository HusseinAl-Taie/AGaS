import { AppLayout } from "@/components/layout";
import { useGetMe, useListWebhooks, useCreateWebhook, useDeleteWebhook, getListWebhooksQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Key, Webhook as WebhookIcon, Trash2, Copy, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function SettingsPage() {
  const { data: user } = useGetMe();
  const { data: webhooksData, isLoading: webhooksLoading } = useListWebhooks();
  
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("run.completed");
  const [secret, setSecret] = useState("");
  
  const [copiedKey, setCopiedKey] = useState(false);
  const [visibleApiKey, setVisibleApiKey] = useState<string | null>(null);

  const rotateApiKey = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/aaas-platform/api/auth/api-key/rotate", { method: "POST", credentials: "include" });
      if (!resp.ok) throw new Error("Failed to rotate API key");
      const data = await resp.json() as { apiKey: string };
      return data;
    },
    onSuccess: (data) => {
      setVisibleApiKey(data.apiKey);
      toast({ title: "New API key generated", description: "Copy it now — it won't be shown again." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate API key.", variant: "destructive" });
    }
  });

  const handleCreateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    createWebhook.mutate(
      {
        data: {
          url,
          events: [event],
          secret: secret || crypto.randomUUID().replace(/-/g, '')
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Webhook created" });
          setIsDialogOpen(false);
          setUrl("");
          setSecret("");
          queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey() });
        }
      }
    );
  };

  const handleDeleteWebhook = (id: string) => {
    deleteWebhook.mutate(
      { webhookId: id },
      {
        onSuccess: () => {
          toast({ title: "Webhook deleted" });
          queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey() });
        }
      }
    );
  };

  const copyApiKey = () => {
    if (!visibleApiKey) return;
    navigator.clipboard.writeText(visibleApiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    toast({ title: "API Key copied to clipboard" });
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your workspace and integrations.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              <CardTitle>Workspace</CardTitle>
            </div>
            <CardDescription>Your tenant configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant Name</p>
                <p className="font-medium">{user?.tenant.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Plan</p>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary capitalize">
                  {user?.tenant.plan}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant ID</p>
                <p className="font-mono text-sm">{user?.tenant.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Your Role</p>
                <p className="capitalize font-medium">{user?.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <CardTitle>API Keys</CardTitle>
            </div>
            <CardDescription>Keys to access the AaaS API programmatically</CardDescription>
          </CardHeader>
          <CardContent>
            {visibleApiKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input value={visibleApiKey} readOnly className="font-mono text-xs bg-muted/50" />
                  </div>
                  <Button variant="outline" onClick={copyApiKey} disabled={!visibleApiKey}>
                    {copiedKey ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copiedKey ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Save this key now — it won't be shown again. If lost, generate a new one.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Input value="aaas_live_••••••••••••••••••••••••••••••••••••••••••••••••" readOnly className="font-mono text-xs bg-muted/50 text-muted-foreground" />
                </div>
              </div>
            )}
            <div className="flex mt-4">
              <Button onClick={() => rotateApiKey.mutate()} disabled={rotateApiKey.isPending} variant={visibleApiKey ? "outline" : "default"} size="sm">
                <RefreshCw className={`w-4 h-4 mr-2 ${rotateApiKey.isPending ? "animate-spin" : ""}`} />
                {visibleApiKey ? "Rotate Key" : "Generate API Key"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Keep this key secret. If compromised, rotate it immediately to revoke all existing access.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <WebhookIcon className="w-5 h-5 text-primary" />
                <CardTitle>Webhooks</CardTitle>
              </div>
              <CardDescription>Receive HTTP callbacks when events occur</CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">Add Webhook</Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateWebhook}>
                  <DialogHeader>
                    <DialogTitle>Create Webhook</DialogTitle>
                    <DialogDescription>Send event payloads to your endpoint.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Endpoint URL</Label>
                      <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/webhook" required />
                    </div>
                    <div className="space-y-2">
                      <Label>Event to subscribe to</Label>
                      <Select value={event} onValueChange={setEvent}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="run.completed">Run Completed</SelectItem>
                          <SelectItem value="run.failed">Run Failed</SelectItem>
                          <SelectItem value="run.awaiting_approval">Run Awaiting Approval</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Secret (Optional)</Label>
                      <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Leave blank to auto-generate" />
                      <p className="text-xs text-muted-foreground">Used to sign webhook payloads so you can verify they came from AaaS.</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createWebhook.isPending}>Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {webhooksLoading ? (
              <div className="h-20 flex items-center justify-center">Loading...</div>
            ) : webhooksData?.webhooks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                No webhooks configured.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooksData?.webhooks.map((wh) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{wh.url}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {wh.events.map(e => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(parseISO(wh.createdAt))} ago
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteWebhook(wh.id)}>
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </Button>
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
