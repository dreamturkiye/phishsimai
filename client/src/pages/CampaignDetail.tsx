import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Mail, MousePointer, KeyRound, AlertCircle, Play, CheckCircle2 } from "lucide-react";
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
  const orgId = orgsData?.[0]?.org?.id;

  const { data, refetch } = trpc.campaigns.get.useQuery(
    { orgId: orgId!, campaignId },
    { enabled: !!orgId && !!campaignId }
  );

  const updateMutation = trpc.campaigns.update.useMutation({
    onSuccess: () => { toast.success("Campaign updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (!data) return (
    <AppLayout title="Campaign">
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  const { campaign, results } = data;
  const sc = statusConfig[campaign.status] ?? statusConfig.draft;

  const sent = results.length;
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
            <Button size="sm" onClick={() => updateMutation.mutate({ orgId: orgId!, campaignId, status: "active" })}>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Launch
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
            { label: "Opened", value: `${sent > 0 ? ((opened / sent) * 100).toFixed(0) : 0}%`, icon: Mail, color: "text-violet-400", bg: "bg-violet-500/10" },
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
          {/* Pie chart */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Result Breakdown</CardTitle>
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
                { label: "Language", value: campaign.language === "en" ? "English" : campaign.language === "es" ? "Spanish" : "Turkish" },
                { label: "Sender", value: campaign.senderName ? `${campaign.senderName} <${campaign.senderEmail}>` : "Not configured" },
                { label: "Created", value: new Date(campaign.createdAt).toLocaleString() },
                { label: "Recurring", value: campaign.isRecurring ? `Yes — ${campaign.cronExpression}` : "No" },
                { label: "Notes", value: campaign.notes ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-muted-foreground flex-shrink-0">{label}</span>
                  <span className="text-right text-xs">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

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
                        <td className="py-2 px-3 font-medium">{r.targetId}</td>
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
