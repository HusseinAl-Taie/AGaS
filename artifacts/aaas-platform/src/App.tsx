import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, Show, useClerk, useUser } from "@clerk/react";
import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import OnboardPage from "@/pages/onboard";
import DashboardPage from "@/pages/dashboard";
import AgentsPage from "@/pages/agents";
import AgentsNewPage from "@/pages/agents-new";
import AgentDetailPage from "@/pages/agent-detail";
import RunsPage from "@/pages/runs";
import RunDetailPage from "@/pages/run-detail";
import ConnectionsPage from "@/pages/connections";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

import { useGetMe } from "@workspace/api-client-react";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

// Redirect signed-in users from home to dashboard
function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

// Protect app routes and check tenant onboarding
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: me, isLoading, error } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && error && (error as any).status === 403) {
      setLocation("/onboard");
    }
  }, [isLoading, error, setLocation]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

// Ensure signed-in user doesn't hit onboard again if already onboarded
function OnboardRoute() {
  const { data: me, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && me) {
      setLocation("/dashboard");
    }
  }, [isLoading, me, setLocation]);

  return (
    <Show when="signed-in">
      <OnboardPage />
    </Show>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboard" component={OnboardRoute} />
            
            <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
            <Route path="/agents"><ProtectedRoute component={AgentsPage} /></Route>
            <Route path="/agents/new"><ProtectedRoute component={AgentsNewPage} /></Route>
            <Route path="/agents/:id"><ProtectedRoute component={AgentDetailPage} /></Route>
            <Route path="/runs"><ProtectedRoute component={RunsPage} /></Route>
            <Route path="/runs/:id"><ProtectedRoute component={RunDetailPage} /></Route>
            <Route path="/connections"><ProtectedRoute component={ConnectionsPage} /></Route>
            <Route path="/settings"><ProtectedRoute component={SettingsPage} /></Route>
            
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
      <Toaster />
    </WouterRouter>
  );
}

export default App;
