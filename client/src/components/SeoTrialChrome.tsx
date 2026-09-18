import { Shield } from "lucide-react";
import { getTrialUrl } from "@/const";

/**
 * PS-SEO-TRIAL-01 — every organic/SEO surface shows a crawlable /trial
 * anchor. Blog and comparison pages previously linked Pricing only.
 */
export function SeoTrialHeader({ campaign }: { campaign: string }) {
  const trial = getTrialUrl({ campaign });
  return (
    <header className="border-b border-border/50">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <Shield className="w-5 h-5 text-primary" /> PhishSim AI
        </a>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
          <a href={trial} className="font-semibold text-violet-300 hover:text-violet-200">
            Start free trial
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SeoTrialFooter({ campaign }: { campaign: string }) {
  const trial = getTrialUrl({ campaign });
  return (
    <aside className="mt-12 rounded-xl border border-violet-500/30 bg-violet-950/30 p-6">
      <p className="font-semibold text-foreground mb-1">Start your 30-day free trial</p>
      <p className="text-sm text-muted-foreground mb-4">
        Full access. No credit card. 60¢/user · $299/mo for 500 seats. Live in 10 minutes.
      </p>
      <a
        href={trial}
        className="inline-flex items-center justify-center rounded-md bg-violet-600 hover:bg-violet-500 text-primary-foreground text-sm font-medium h-11 px-4"
      >
        Start 30-day free trial
      </a>
    </aside>
  );
}
