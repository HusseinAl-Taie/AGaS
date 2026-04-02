import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useOnboardUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Box, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function OnboardPage() {
  const [, setLocation] = useLocation();
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const onboardUser = useOnboardUser();
  const queryClient = useQueryClient();
  
  const [tenantName, setTenantName] = useState("");

  if (!isLoaded) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenantName.trim()) {
      toast({ title: "Error", description: "Tenant name is required", variant: "destructive" });
      return;
    }

    onboardUser.mutate(
      { 
        data: { 
          tenantName, 
          email: user?.primaryEmailAddress?.emailAddress || "" 
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          setLocation("/dashboard");
        },
        onError: (error) => {
          toast({ 
            title: "Error setting up account", 
            description: error.error || "An unknown error occurred", 
            variant: "destructive" 
          });
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background"></div>
      
      <Card className="w-full max-w-md shadow-lg border-border/50">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-sm mb-4">
            <Box className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Welcome to AaaS</CardTitle>
          <CardDescription>Let's set up your workspace to get started</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Workspace Name</Label>
              <Input 
                id="tenant-name" 
                placeholder="e.g. Acme Corp" 
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                autoFocus
                data-testid="input-tenant-name"
              />
              <p className="text-xs text-muted-foreground">
                This is your team's shared workspace where agents live.
              </p>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label>Email Address</Label>
              <Input 
                value={user?.primaryEmailAddress?.emailAddress || ""}
                disabled
                className="bg-muted/50"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full h-11" 
              disabled={onboardUser.isPending}
              data-testid="button-submit-onboard"
            >
              {onboardUser.isPending ? "Creating Workspace..." : "Create Workspace"}
              {!onboardUser.isPending && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
