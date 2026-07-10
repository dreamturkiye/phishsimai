import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Clock, Plus, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const REASON_MESSAGE: Record<string, string> = {
  txt_not_found: "No TXT record found yet — DNS can take a few minutes to propagate.",
  token_mismatch: "A TXT record was found, but the token doesn't match. Copy the exact value below.",
  dns_lookup_failed: "Couldn't reach DNS for that domain. Try again in a moment.",
  not_pending: "This domain isn't pending verification.",
};

export default function VerifiedDomainsSection({ orgId, isAdmin }: { orgId: number; isAdmin: boolean }) {
  const [newDomain, setNewDomain] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const { data: domains = [], refetch } = trpc.orgs.listDomains.useQuery({ orgId }, { enabled: !!orgId });

  const addPending = trpc.orgs.addPending.useMutation({
    onSuccess: () => { toast.success("Domain added — publish the DNS TXT record below, then verify."); setNewDomain(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const checkVerification = trpc.orgs.checkVerification.useMutation({
    onSuccess: (res) => {
      if (res.verified) toast.success("Domain verified — you can now run simulations against it.");
      else toast.error(REASON_MESSAGE[res.reason ?? ""] ?? "Verification failed.");
      setChecking(null);
      refetch();
    },
    onError: (e) => { toast.error(e.message); setChecking(null); },
  });

  const copy = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          Verified Domains ({domains.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          You can only run simulations against domains you've verified you control. Add a domain, publish
          the DNS TXT record we generate, then verify — the compliance floor sends only to verified domains.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <div className="flex items-end gap-2">
            <div className="space-y-1.5 flex-1 max-w-sm">
              <Label className="text-xs">Add domain</Label>
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="acme.com"
                className="bg-background border-border/60"
                onKeyDown={(e) => { if (e.key === "Enter" && newDomain.trim()) addPending.mutate({ orgId, domain: newDomain.trim() }); }}
              />
            </div>
            <Button
              size="sm"
              disabled={!newDomain.trim() || addPending.isPending}
              onClick={() => addPending.mutate({ orgId, domain: newDomain.trim() })}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {addPending.isPending ? "Adding..." : "Add domain"}
            </Button>
          </div>
        )}

        {domains.length === 0 && (
          <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-4 text-center">
            No domains yet. Add the domain your employees' email addresses use.
          </div>
        )}

        <div className="space-y-3">
          {domains.map((d) => {
            const txtValue = d.verificationToken ?? "";
            return (
              <div key={d.domain} className="rounded-lg border border-border/40 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm font-mono">{d.domain}</div>
                    {d.verified && d.verifiedAt && (
                      <div className="text-xs text-muted-foreground">Verified {new Date(d.verifiedAt).toLocaleDateString()}</div>
                    )}
                  </div>
                  {d.verified ? (
                    <Badge variant="outline" className="text-xs border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      <ShieldCheck className="w-2.5 h-2.5 mr-1" />Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs border bg-amber-500/10 text-amber-400 border-amber-500/30">
                      <Clock className="w-2.5 h-2.5 mr-1" />Pending
                    </Badge>
                  )}
                  {isAdmin && !d.verified && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={checking === d.domain && checkVerification.isPending}
                      onClick={() => { setChecking(d.domain); checkVerification.mutate({ orgId, domain: d.domain }); }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${checking === d.domain && checkVerification.isPending ? "animate-spin" : ""}`} />
                      Check verification
                    </Button>
                  )}
                </div>

                {!d.verified && txtValue && (
                  <div className="space-y-1.5 bg-secondary/40 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Add this DNS TXT record, then click “Check verification”:</div>
                    <div className="grid gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-10 shrink-0">Name</span>
                        <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 min-w-0 truncate">{d.domain}</code>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => copy(d.domain, `name:${d.domain}`)}>
                          {copiedKey === `name:${d.domain}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-10 shrink-0">Value</span>
                        <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 min-w-0 truncate">{txtValue}</code>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => copy(txtValue, `val:${d.domain}`)}>
                          {copiedKey === `val:${d.domain}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
