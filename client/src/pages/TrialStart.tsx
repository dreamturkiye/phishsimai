import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { CheckCircle2, ArrowRight } from "lucide-react";

const UTM_STORAGE = "ps_trial_utm";

type Utm = { utm_source?: string; utm_medium?: string; utm_campaign?: string; source?: string };

function readUtm(): Utm {
  try {
    const p = new URLSearchParams(window.location.search);
    const fresh: Utm = {
      utm_source: p.get("utm_source") || undefined,
      utm_medium: p.get("utm_medium") || undefined,
      utm_campaign: p.get("utm_campaign") || undefined,
      source: p.get("source") || p.get("utm_source") || undefined,
    };
    if (fresh.utm_source || fresh.source) {
      sessionStorage.setItem(UTM_STORAGE, JSON.stringify(fresh));
      return fresh;
    }
    const stored = sessionStorage.getItem(UTM_STORAGE);
    return stored ? (JSON.parse(stored) as Utm) : {};
  } catch {
    return {};
  }
}

function readPrefillEmail(): string {
  try {
    return (new URLSearchParams(window.location.search).get("email") || "").trim();
  } catch {
    return "";
  }
}

function readRedirect(): string {
  try {
    const redirect = new URLSearchParams(window.location.search).get("redirect") || "";
    return redirect.startsWith("/") ? redirect : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/**
 * PS-TRIAL-START-01 — one form, no card, no captcha. This is the page warm/cold
 * CTAs must land on. /login?mode=register redirects here so old emails still convert.
 */
export default function TrialStart() {
  const seo = seoForPath("/trial");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [utm, setUtm] = useState<Utm>({});

  useEffect(() => {
    setEmail(readPrefillEmail());
    setUtm(readUtm());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          name: name.trim() || undefined,
          company: company.trim() || undefined,
          source: utm.source || utm.utm_source || "trial_page",
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          const params = new URLSearchParams();
          const existing = email.trim();
          if (existing) params.set("email", existing);
          const redirect = readRedirect();
          if (redirect && redirect !== "/dashboard") params.set("redirect", redirect);
          const q = params.toString();
          window.location.href = "/login" + (q ? `?${q}` : "");
          return;
        }
        setError(typeof data.error === "string" ? data.error : "Something went wrong");
        return;
      }
      window.location.href = readRedirect();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-12">
      <Seo title={seo.title} description={seo.description} path={seo.path} />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center justify-center mb-6">
            <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-8 w-auto" />
          </a>
          <h1 className="text-3xl font-black tracking-tight mb-3">Start your 30-day free trial</h1>
          <p className="rounded-lg border border-violet-500/30 bg-violet-950/40 px-3 py-2 text-sm font-semibold text-violet-100 leading-snug">
            60¢/user · $299/mo for 500 · 30-day, no card · live in 10 min.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed mt-3">
            Full access. No credit card. Live in 10 minutes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <details className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Add name & company (optional)
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="First name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company (optional)</Label>
                <Input
                  id="company"
                  type="text"
                  placeholder="Your MSP / company"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  autoComplete="organization"
                />
              </div>
            </div>
          </details>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <Button type="submit" className="w-full h-11 bg-violet-600 hover:bg-violet-500" disabled={loading}>
            {loading ? "Starting your trial…" : (
              <>Start 30-day trial <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
          <div className="flex flex-col gap-1.5 pt-1 text-xs text-muted-foreground">
            {["No credit card required", "No email verification to start", "Cancel anytime after the trial"].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />{t}
              </span>
            ))}
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-violet-400 hover:underline font-medium">Sign in</a>
        </p>
      </div>
    </div>
  );
}
