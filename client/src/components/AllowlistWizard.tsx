import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Copy, CheckCheck, AlertTriangle, ChevronRight } from "lucide-react";

/**
 * PS-DELIVER-ALLOWLIST-01 UI — the guided wizard on top of the working gate. An admin used to hit a
 * raw PRECONDITION_FAILED at launch; this gives them a flow. The honesty label
 * "admin confirmed — not verified by us" is preserved verbatim: no vendor API lets us verify a
 * tenant's Advanced Delivery config, so we never claim we did.
 */
export default function AllowlistWizard({ orgId }: { orgId: number }) {
  const { data, isLoading, refetch } = trpc.allowlist.state.useQuery({ orgId }, { enabled: !!orgId });
  const confirm = trpc.allowlist.confirm.useMutation({
    onSuccess: () => { toast.success("Allowlist marked as configured"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const skip = trpc.allowlist.skip.useMutation({
    onSuccess: () => { toast("Skipped — simulations may land in spam"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  if (isLoading || !data) return null;
  const m365 = data.microsoft365;
  const state = data.state;

  const copy = (v: string, key: string) => {
    navigator.clipboard?.writeText(v);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const StatusBadge = () => {
    if (state === "confirmed_by_admin")
      return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">Admin confirmed — not verified by us</Badge>;
    if (state === "skipped")
      return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">Skipped — sims may land in spam</Badge>;
    return <Badge variant="secondary">Not started</Badge>;
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4 text-primary" /> Inbox delivery (allowlisting)
          <span className="ml-auto"><StatusBadge /></span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          Simulated phishing looks like phishing by design, so it lands in spam even with SPF/DKIM/DMARC
          passing. Allowlisting our simulation domain lets your first campaign reach the inbox. This takes
          about two minutes in the Microsoft 365 admin center.
        </p>

        {step === 0 && (
          <Button onClick={() => setStep(1)} className="gap-1">
            {state === "not_started" ? "Set up allowlisting" : "Review allowlist setup"} <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">Microsoft 365 — Advanced Delivery</div>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[13px]">
                {m365.path.map((p, i) => <li key={i}>{p}</li>)}
              </ol>

              <div className="space-y-2">
                <FieldRow label="Sending domain" value={m365.sendingDomain} onCopy={() => copy(m365.sendingDomain, "dom")} copied={copied === "dom"} />
                {m365.urls.map((u, i) => (
                  <FieldRow key={i} label={i === 0 ? "Simulation URLs" : ""} value={u} onCopy={() => copy(u, `u${i}`)} copied={copied === `u${i}`} />
                ))}
              </div>

              {m365.unavailable.map((g, i) => (
                <p key={i} className="text-[12px] text-amber-400/90 leading-relaxed">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />{g.field}: {g.why}
                </p>
              ))}
              {m365.notes.map((n, i) => <p key={i} className="text-[12px] text-muted-foreground leading-relaxed">{n}</p>)}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => confirm.mutate({ orgId, platform: "microsoft365" })}
                disabled={confirm.isPending}
                className="gap-1"
              >
                <CheckCheck className="w-4 h-4" /> I've configured this
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm(data.skipWarning)) skip.mutate({ orgId, ack: data.skipWarning });
                }}
                disabled={skip.isPending}
              >
                Skip for now
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              When you confirm, we record that <strong>you</strong> configured allowlisting — we cannot verify a
              tenant's Advanced Delivery settings, so we never claim we did.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0 text-[12px] text-muted-foreground">{label}</div>
      <code className="flex-1 truncate rounded bg-background/60 border border-border/60 px-2 py-1 text-[12px]">{value}</code>
      <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2">
        {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}
