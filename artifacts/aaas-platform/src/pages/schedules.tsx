import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useListAgents,
  getListSchedulesQueryKey,
  type Schedule,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, Plus, Trash2, Clock, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";

const PRESET_CRONS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
  { label: "Custom", value: "custom" },
];

function detectPreset(expr: string): string {
  const found = PRESET_CRONS.find((p) => p.value !== "custom" && p.value === expr);
  return found ? found.value : "custom";
}

interface ScheduleFormState {
  selectedAgentId: string;
  cronPreset: string;
  customCron: string;
  inputTemplate: string;
  inputTemplateError: string;
}

const defaultForm = (): ScheduleFormState => ({
  selectedAgentId: "",
  cronPreset: PRESET_CRONS[2].value,
  customCron: "",
  inputTemplate: "{}",
  inputTemplateError: "",
});

function formFromSchedule(s: Schedule): ScheduleFormState {
  return {
    selectedAgentId: s.agentId,
    cronPreset: detectPreset(s.cronExpression),
    customCron: detectPreset(s.cronExpression) === "custom" ? s.cronExpression : "",
    inputTemplate: JSON.stringify(s.inputTemplate ?? {}, null, 2),
    inputTemplateError: "",
  };
}

export default function SchedulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schedulesData, isLoading } = useListSchedules();
  const { data: agentsData } = useListAgents({});
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(defaultForm());

  const agents = agentsData?.agents ?? [];
  const schedules = schedulesData?.schedules ?? [];

  const cronExpression = form.cronPreset === "custom" ? form.customCron : form.cronPreset;

  const updateForm = (patch: Partial<ScheduleFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const openCreate = () => {
    setForm(defaultForm());
    setIsCreateOpen(true);
  };

  const openEdit = (s: Schedule) => {
    setForm(formFromSchedule(s));
    setEditingSchedule(s);
  };

  const closeDialogs = () => {
    setIsCreateOpen(false);
    setEditingSchedule(null);
    setForm(defaultForm());
  };

  const parseInputTemplate = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(form.inputTemplate) as Record<string, unknown>;
      updateForm({ inputTemplateError: "" });
      return parsed;
    } catch {
      updateForm({ inputTemplateError: "Invalid JSON" });
      return null;
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedAgentId || !cronExpression) {
      toast({ title: "Agent and cron expression are required", variant: "destructive" });
      return;
    }
    const parsedInput = parseInputTemplate();
    if (parsedInput === null) return;

    createSchedule.mutate(
      { data: { agentId: form.selectedAgentId, cronExpression, inputTemplate: parsedInput, enabled: true } },
      {
        onSuccess: () => {
          toast({ title: "Schedule created" });
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
          closeDialogs();
        },
        onError: (err) => {
          toast({ title: "Failed to create schedule", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule || !cronExpression) return;
    const parsedInput = parseInputTemplate();
    if (parsedInput === null) return;

    updateSchedule.mutate(
      {
        scheduleId: editingSchedule.id,
        data: { cronExpression, inputTemplate: parsedInput },
      },
      {
        onSuccess: () => {
          toast({ title: "Schedule updated" });
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
          closeDialogs();
        },
        onError: (err) => {
          toast({ title: "Update failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleToggle = (scheduleId: string, enabled: boolean) => {
    updateSchedule.mutate(
      { scheduleId, data: { enabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Update failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (scheduleId: string) => {
    deleteSchedule.mutate(
      { scheduleId },
      {
        onSuccess: () => {
          toast({ title: "Schedule deleted" });
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Delete failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name ?? agentId.slice(0, 8);
  };

  const ScheduleForm = ({ mode }: { mode: "create" | "edit" }) => (
    <form onSubmit={mode === "create" ? handleCreate : handleEdit} className="space-y-4">
      {mode === "create" && (
        <div className="space-y-2">
          <Label>Agent</Label>
          <Select value={form.selectedAgentId} onValueChange={(v) => updateForm({ selectedAgentId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Frequency</Label>
        <Select value={form.cronPreset} onValueChange={(v) => updateForm({ cronPreset: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_CRONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.cronPreset === "custom" ? (
          <Input
            placeholder="e.g. 0 9 * * 1-5"
            value={form.customCron}
            onChange={(e) => updateForm({ customCron: e.target.value })}
          />
        ) : (
          <p className="text-xs text-muted-foreground font-mono">{cronExpression}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Input Template (JSON)</Label>
        <Input
          placeholder='{"message": "Daily report"}'
          value={form.inputTemplate}
          onChange={(e) => updateForm({ inputTemplate: e.target.value })}
        />
        {form.inputTemplateError && (
          <p className="text-xs text-destructive">{form.inputTemplateError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          JSON object passed as input when this schedule fires.
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={closeDialogs}>Cancel</Button>
        <Button type="submit" disabled={createSchedule.isPending || updateSchedule.isPending}>
          {mode === "create"
            ? (createSchedule.isPending ? "Creating…" : "Create")
            : (updateSchedule.isPending ? "Saving…" : "Save Changes")}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Schedules</h1>
            <p className="text-muted-foreground">Run agents automatically on a cron schedule.</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) closeDialogs(); else openCreate(); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> New Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Schedule</DialogTitle>
                <DialogDescription>Configure a cron trigger for an agent.</DialogDescription>
              </DialogHeader>
              <ScheduleForm mode="create" />
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingSchedule} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Schedule</DialogTitle>
              <DialogDescription>Update the cron expression or input template.</DialogDescription>
            </DialogHeader>
            <ScheduleForm mode="edit" />
          </DialogContent>
        </Dialog>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-foreground mb-1">No schedules yet</h3>
                <p className="text-sm">Create a schedule to run agents on a cron trigger.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Cron Expression</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{getAgentName(s.agentId)}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{s.cronExpression}</code>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {s.nextRunAt
                            ? formatDistanceToNow(parseISO(s.nextRunAt), { addSuffix: true })
                            : "Not scheduled"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={s.enabled}
                            onCheckedChange={(checked) => handleToggle(s.id, checked)}
                            data-testid={`toggle-schedule-${s.id}`}
                          />
                          <Badge variant={s.enabled ? "default" : "secondary"} className="text-xs">
                            {s.enabled ? "Active" : "Paused"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(s)}
                            data-testid={`edit-schedule-${s.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(s.id)}
                            disabled={deleteSchedule.isPending}
                            data-testid={`delete-schedule-${s.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
