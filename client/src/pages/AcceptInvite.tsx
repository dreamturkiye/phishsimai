import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function AcceptInvite() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  // BUG-03 FIX: read token from route path param /invite/:token
  const { token = "" } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");

  const acceptMutation = trpc.orgs.acceptInvite.useMutation({
    onSuccess: () => {
      setStatus("success");
      setTimeout(() => navigate("/dashboard"), 2000);
    },
    onError: (e) => {
      setStatus("error");
      toast.error(e.message);
    },
  });

  const handleAccept = () => {
    if (!token) return;
    setStatus("accepting");
    acceptMutation.mutate({ token });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm border-border/60">
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="font-bold text-lg mb-2">You've been invited!</h2>
            <p className="text-sm text-muted-foreground mb-6">Sign in to accept your invitation to join a PhishSim AI organization.</p>
            <Button className="w-full" onClick={() => window.location.href = getLoginUrl(`/invite/${token}`)}>
              Sign In to Accept
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-border/60">
        <CardContent className="p-8 text-center">
          {status === "success" ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h2 className="font-bold text-lg mb-2">Invitation Accepted!</h2>
              <p className="text-sm text-muted-foreground">Redirecting you to the dashboard...</p>
            </>
          ) : status === "error" ? (
            <>
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="font-bold text-lg mb-2">Invalid Invitation</h2>
              <p className="text-sm text-muted-foreground mb-6">This invitation link may have expired or already been used.</p>
              <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
            </>
          ) : (
            <>
              <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="font-bold text-lg mb-2">Accept Invitation</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {token ? "Click below to join the organization." : "No invitation token found in the URL."}
              </p>
              <Button
                className="w-full"
                disabled={!token || status === "accepting"}
                onClick={handleAccept}
              >
                {status === "accepting" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Accepting...</>
                ) : "Accept Invitation"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
