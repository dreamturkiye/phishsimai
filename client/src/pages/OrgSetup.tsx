import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, Building2, ArrowRight } from "lucide-react";

export default function OrgSetup() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [orgName, setOrgName] = useState("");

  const createOrgMutation = trpc.orgs.create.useMutation({
    onSuccess: () => {
      toast.success("Organization created! Welcome to PhishSim AI.");
      navigate("/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to PhishSim AI</h1>
          <p className="text-muted-foreground text-sm">
            Hi {user?.name?.split(" ")[0] ?? "there"}! Let's set up your organization to get started.
          </p>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-1.5">
              <Label className="text-xs">Organization Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Acme Corporation"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  className="pl-9 bg-background border-border/60"
                  onKeyDown={e => e.key === "Enter" && orgName.trim() && createOrgMutation.mutate({ name: orgName })}
                />
              </div>
              <p className="text-xs text-muted-foreground">This is the name of your company or team.</p>
            </div>

            <Button
              className="w-full"
              disabled={!orgName.trim() || createOrgMutation.isPending}
              onClick={() => createOrgMutation.mutate({ name: orgName })}
            >
              {createOrgMutation.isPending ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Creating...</>
              ) : (
                <>Create Organization <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
