import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Box, ArrowRight, Zap, Shield, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      <header className="h-20 flex items-center justify-between px-6 md:px-12 border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground shadow-sm">
            <Box className="w-5 h-5" />
          </div>
          <span>AaaS Platform</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="font-medium rounded-full px-5 shadow-sm" data-testid="link-signup">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="py-24 md:py-32 px-6 md:px-12 flex flex-col items-center text-center max-w-5xl mx-auto relative">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 border border-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Agentic as a Service is now in public beta
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-balance leading-[1.1] mb-6">
            Mission Control for <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
              Autonomous Agents
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed text-balance">
            Deploy, monitor, and scale AI agents that run complex, multi-step tasks on your behalf. Built for engineering teams who demand precision and control.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto h-12 px-8 rounded-full text-base font-semibold shadow-md group">
                Start Building Free
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 rounded-full text-base font-medium border-border/60 hover:bg-muted/50">
              View Documentation
            </Button>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-muted/30 border-y border-border/40 px-6 md:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight mb-4">Engineering-grade infrastructure</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Everything you need to build reliable autonomous systems, without the boilerplate.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-background rounded-xl p-8 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Fast Execution</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Optimized agent loops with minimal latency. Connect your agents to real-world tools via MCP integrations in seconds.
                </p>
              </div>
              
              <div className="bg-background rounded-xl p-8 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-chart-2/10 text-chart-2 rounded-lg flex items-center justify-center mb-6">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Human-in-the-Loop</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Require explicit approval for high-stakes actions. Set strict token and cost budgets per agent to prevent runaways.
                </p>
              </div>
              
              <div className="bg-background rounded-xl p-8 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-chart-4/10 text-chart-4 rounded-lg flex items-center justify-center mb-6">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Deep Observability</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Trace every thought, tool call, and result. Understand exactly why an agent made a decision with step-by-step playback.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-6 md:px-12 border-t border-border/40 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} AaaS Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
