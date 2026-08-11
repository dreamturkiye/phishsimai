import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Sparkles, Clock } from "lucide-react";

// PS-TRIAL-01: surfaces the trial countdown / expired-free upgrade prompt app-wide. The upgrade
// path was buried in Settings → Billing with no nudge; this makes it visible the moment it matters.
// Silent for paid + grandfathered orgs (full access, nothing to sell).
export default function TrialBanner({ orgId }: { orgId?: number }) {
  const [, navigate] = useLocation();
  const { data: ent } = trpc.orgs.entitlements.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  if (!ent) return null;

  if (ent.tier === "trial") {
    const d = ent.trialDaysLeft ?? 0;
    const urgent = d <= 3;
    return (
      <button
        onClick={() => navigate("/settings?tab=billing")}
        className={`w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-medium transition-colors ${urgent ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
      >
        <Clock className="w-3.5 h-3.5" />
        {d > 0 ? `${d} day${d === 1 ? "" : "s"} left in your free trial` : "Your trial ends today"} — <span className="underline">upgrade to keep full access</span>
      </button>
    );
  }

  if (ent.tier === "free_expired") {
    return (
      <button
        onClick={() => navigate("/settings?tab=billing")}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Your free trial has ended — you're on the free plan (1 campaign, 10 targets). <span className="underline">Upgrade to run your full program</span>
      </button>
    );
  }

  return null; // paid / grandfathered — nothing to nudge
}
