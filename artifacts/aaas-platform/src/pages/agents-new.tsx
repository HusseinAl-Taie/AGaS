import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useCreateAgent } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Box, Mail, Code, FileText, AlertTriangle, PenTool, CheckCircle2 } from "lucide-react";

const TEMPLATES = [
  {
    id: "blank",
    name: "Blank Canvas",
    icon: Box,
    description: "Start from scratch with a clean configuration.",
    prompt: "You are a helpful assistant.",
    model: "gpt-4o",
    approvalMode: "auto"
  },
  {
    id: "email",
    name: "Email Triage",
    icon: Mail,
    description: "Sorts, categorizes, and drafts replies to incoming emails.",
    prompt: "You are an executive assistant managing an inbox. Categorize emails as Urgent, Routine, or Spam. Draft polite professional replies for Routine emails.",
    model: "gpt-4o",
    approvalMode: "human_in_loop"
  },
  {
    id: "code",
    name: "Code Reviewer",
    icon: Code,
    description: "Analyzes pull requests for bugs, security issues, and style.",
    prompt: "You are a senior principal engineer. Review the provided code diffs. Look for security vulnerabilities, performance bottlenecks, and adherence to clean code principles. Provide specific actionable feedback.",
    model: "claude-3-5-sonnet",
    approvalMode: "auto"
  },
  {
    id: "data",
    name: "Data Summariser",
    icon: FileText,
    description: "Extracts key insights from reports and spreadsheets.",
    prompt: "You are a data analyst. Extract the top 3 trends, key metrics, and an executive summary from the provided data. Format output as clear markdown.",
    model: "gpt-4o-mini",
    approvalMode: "auto"
  },
  {
    id: "incident",
    name: "Incident Responder",
    icon: AlertTriangle,
    description: "Investigates alerts, checks logs, and proposes mitigations.",
    prompt: "You are an SRE on-call. An alert has fired. Query the necessary logs to determine root cause. Propose a mitigation strategy and evaluate risks.",
    model: "claude-3-5-sonnet",
    approvalMode: "human_in_loop"
  },
  {
    id: "content",
    name: "Content Drafter",
    icon: PenTool,
    description: "Generates blog posts, changelogs, and documentation.",
    prompt: "You are a technical writer. Draft clear, engaging content based on the provided technical bullet points. Use active voice and maintain a professional yet accessible tone.",
    model: "gpt-4o",
    approvalMode: "auto"
  }
];

export default function AgentsNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createAgent = useCreateAgent();
  
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");
  const [maxSteps, setMaxSteps] = useState(15);
  const [maxBudgetCents, setMaxBudgetCents] = useState(500);
  const [approvalMode, setApprovalMode] = useState<"auto" | "human_in_loop">("auto");

  const selectTemplate = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template);
    setName(template.id === "blank" ? "" : template.name);
    setDescription(template.description);
    setSystemPrompt(template.prompt);
    setModel(template.model);
    setApprovalMode(template.approvalMode as "auto" | "human_in_loop");
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }

    createAgent.mutate(
      {
        data: {
          name,
          description,
          systemPrompt,
          model,
          maxSteps: Number(maxSteps),
          maxBudgetCents: Number(maxBudgetCents),
          approvalMode,
          tools: []
        }
      },
      {
        onSuccess: (agent) => {
          toast({ title: "Agent created", description: `${agent.name} is ready to run.` });
          setLocation(`/agents/${agent.id}`);
        },
        onError: (err) => {
          toast({ title: "Creation failed", description: err.message || "An error occurred", variant: "destructive" });
        }
      }
    );
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Agent</h1>
          <p className="text-muted-foreground">Configure a new autonomous agent.</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button 
            className={`font-medium ${step === 1 ? 'text-primary' : 'hover:text-foreground cursor-pointer'}`}
            onClick={() => setStep(1)}
          >
            1. Select Template
          </button>
          <span>/</span>
          <span className={`font-medium ${step === 2 ? 'text-primary' : ''}`}>
            2. Configure
          </span>
        </div>

        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((template) => (
              <Card 
                key={template.id} 
                className={`cursor-pointer transition-all hover:border-primary hover:shadow-md ${selectedTemplate.id === template.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => selectTemplate(template)}
              >
                <CardHeader className="pb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <template.icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center">
                      <selectedTemplate.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>Identify your agent</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Agent Name <span className="text-destructive">*</span></Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Code Reviewer" autoFocus data-testid="input-agent-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Behavior</CardTitle>
                  <CardDescription>Core instructions and model</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System Prompt <span className="text-destructive">*</span></Label>
                    <Textarea 
                      id="systemPrompt" 
                      value={systemPrompt} 
                      onChange={(e) => setSystemPrompt(e.target.value)} 
                      className="min-h-[150px] font-mono text-sm" 
                      placeholder="You are a helpful assistant..."
                    />
                    <p className="text-xs text-muted-foreground">The foundational instructions that guide the agent's behavior.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                        <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                        <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Guardrails</CardTitle>
                  <CardDescription>Limits and approval settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="maxSteps">Max Steps</Label>
                      <Input id="maxSteps" type="number" min="1" max="100" value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} />
                      <p className="text-xs text-muted-foreground">Maximum number of thought/tool loops per run.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxBudget">Max Budget (Cents)</Label>
                      <Input id="maxBudget" type="number" min="1" value={maxBudgetCents} onChange={(e) => setMaxBudgetCents(Number(e.target.value))} />
                      <p className="text-xs text-muted-foreground">E.g., 500 = $5.00 limit per run.</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <Label>Approval Mode</Label>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div 
                        className={`border rounded-lg p-4 cursor-pointer flex gap-3 ${approvalMode === 'auto' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}
                        onClick={() => setApprovalMode('auto')}
                      >
                        <div className="mt-0.5">
                          <CheckCircle2 className={`w-5 h-5 ${approvalMode === 'auto' ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <div className="font-medium">Auto-approve</div>
                          <div className="text-xs text-muted-foreground mt-1">Agent runs autonomously to completion. Best for low-risk tasks.</div>
                        </div>
                      </div>
                      
                      <div 
                        className={`border rounded-lg p-4 cursor-pointer flex gap-3 ${approvalMode === 'human_in_loop' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}
                        onClick={() => setApprovalMode('human_in_loop')}
                      >
                        <div className="mt-0.5">
                          <AlertTriangle className={`w-5 h-5 ${approvalMode === 'human_in_loop' ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <div className="font-medium">Human-in-the-loop</div>
                          <div className="text-xs text-muted-foreground mt-1">Agent pauses for explicit approval before taking actions. Best for high-stakes.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 mt-4">
                <Button type="button" variant="outline" onClick={() => setLocation('/agents')}>Cancel</Button>
                <Button type="submit" disabled={createAgent.isPending} data-testid="button-save-agent">
                  {createAgent.isPending ? "Creating..." : "Create Agent"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
