import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Mail, MousePointer, KeyRound, AlertCircle, Play, CheckCircle2, Users, Eye } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed: { label: "Completed", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  paused: { label: "Paused", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const campaignId = parseInt(id ?? "0");

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const { orgId } = useActiveOrg();

  const { data, refetch } = trpc.campaigns.get.useQuery(
    { orgId: orgId!, campaignId },
    { enabled: !!orgId && !!campaignId }
  );

  const updateMutation = trpc.campaigns.update.useMutation({
    onSuccess: () => { toast.success("Campaign updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // 1b: the REAL launch. Previously the "Launch" button called campaigns.update to flip the status
  // to 'active' — it sent nothing, but told the user it had. This calls campaigns.launch, which
  // sends through the compliance floor and returns exactly what happened. The status only becomes
  // 'active' server-side when at least one email was genuinely accepted; on total failure the
  // mutation throws and the real reason (domain not enrolled / provider error) surfaces.
  const launchMutation = trpc.campaigns.launch.useMutation({
    onSuccess: (res) => {
      if (res.rejected > 0 || res.failed > 0) toast.warning(res.message);
      else toast.success(res.message);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!data) return (
    <AppLayout title="Campaign">
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  const { campaign, results, template, targets } = data;
  const sc = statusConfig[campaign.status] ?? statusConfig.draft;
  // Build a targetId → name map from the enriched targets list
  const targetMap = Object.fromEntries((targets ?? []).map((t: { id: number; firstName: string; lastName: string }) => [t.id, `${t.firstName} ${t.lastName}`]));

  // 1b: count PROVIDER-ACCEPTED sends, not rows. A row can exist for a send the provider rejected
  // (emailSentAt stays null), so results.length overstated "Emails Sent". delivered/bounced come
  // from the Resend webhook — the difference between "we sent it" and "it actually arrived".
  const sent = results.filter(r => r.emailSentAt).length;
  const delivered = results.filter(r => r.deliveredAt).length;
  const bounced = results.filter(r => r.bouncedAt).length;
  const opened = results.filter(r => r.emailOpenedAt).length;
  const clicked = results.filter(r => r.linkClickedAt).length;
  const submitted = results.filter(r => r.credentialSubmittedAt).length;

  const pieData = [
    { name: "Not Opened", value: Math.max(0, sent - opened), color: "oklch(0.22 0.02 260)" },
    { name: "Opened", value: Math.max(0, opened - clicked), color: "oklch(0.62 0.22 265)" },
    { name: "Clicked", value: Math.max(0, clicked - submitted), color: "oklch(0.68 0.20 35)" },
    { name: "Submitted Creds", value: submitted, color: "oklch(0.60 0.22 25)" },
  ].filter(d => d.value > 0);

  return (
    <AppLayout
      title={campaign.name}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`border ${sc.className}`}>{sc.label}</Badge>
          {campaign.status === "draft" && (
            <Button
              size="sm"
              disabled={launchMutation.isPending}
              onClick={() => {
                // Irreversible: this sends real simulated-phishing email to every assigned target.
                if (!window.confirm(`Launch "${campaign.name}"? This sends a real simulated-phishing email to every assigned target. It cannot be undone.`)) return;
                launchMutation.mutate({ orgId: orgId!, campaignId });
              }}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              {launchMutation.isPending ? "Launching…" : "Launch"}
            </Button>
          )}
          {campaign.status === "active" && (
            <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ orgId: orgId!, campaignId, status: "completed" })}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Mark Complete
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to Campaigns
        </Button>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Emails Sent", value: sent, icon: Mail, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Opened", value: `${sent > 0 ? ((opened / sent) * 100).toFixed(0) : 0}%`, icon: Eye, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "Clicked Link", value: `${sent > 0 ? ((clicked / sent) * 100).toFixed(0) : 0}%`, icon: MousePointer, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "Submitted Creds", value: `${sent > 0 ? ((submitted / sent) * 100).toFixed(0) : 0}%`, icon: KeyRound, color: "text-red-400", bg: "bg-red-500/10" },
          ].map((s) => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-5">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Funnel chart */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Engagement Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "oklch(0.13 0.015 260)", border: "1px solid oklch(0.22 0.02 260)", borderRadius: "8px", fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.name}</span>
                        <span className="font-medium ml-auto">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No results yet. Launch the campaign to start tracking.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campaign details */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Campaign Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                            {[
                { label: "Template", value: template ? template.name : "None" },
                { label: "Targets", value: (targets ?? []).length > 0 ? `${(targets ?? []).length} assigned` : "None assigned" },
                { label: "Delivery", value: sent > 0 ? `${delivered} delivered · ${bounced} bounced (of ${sent} sent)` : "Not launched yet" },
                { label: "Language", value: campaign.language === "en" ? "English" : campaign.language === "es" ? "Spanish" : "Turkish" },
                { label: "Sender", value: campaign.senderName ? `${campaign.senderName} <${campaign.senderEmail}>` : "Not configured" },
                { label: "Created", value: new Date(campaign.createdAt).toLocaleString() },
                { label: "Recurring", value: campaign.isRecurring ? `Yes — ${campaign.cronExpression}` : "No" },
                ...(campaign.notes ? [{ label: "Notes", value: campaign.notes }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-muted-foreground flex-shrink-0 text-xs">{label}</span>
                  <span className="text-right text-xs">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Assigned targets */}
        {(targets ?? []).length > 0 && (
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Assigned Targets ({(targets ?? []).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(targets ?? []).map((t: { id: number; firstName: string; lastName: string; email: string }) => (
                  <div key={t.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/40">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">
                      {t.firstName[0]}{t.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{t.firstName} {t.lastName}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Individual Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Target</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Opened</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Clicked</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Submitted</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-accent/30">
                        <td className="py-2 px-3 font-medium">{targetMap[r.targetId] ?? `Target #${r.targetId}`}</td>
                        <td className="py-2 px-3 text-center">{r.emailOpenedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : "—"}</td>
                        <td className="py-2 px-3 text-center">{r.linkClickedAt ? <AlertCircle className="w-3.5 h-3.5 text-amber-400 mx-auto" /> : "—"}</td>
                        <td className="py-2 px-3 text-center">{r.credentialSubmittedAt ? <AlertCircle className="w-3.5 h-3.5 text-red-400 mx-auto" /> : "—"}</td>
                        <td className="py-2 px-3 text-center">{r.reportedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mx-auto" /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
