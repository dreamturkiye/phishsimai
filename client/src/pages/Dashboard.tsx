import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  Mail, MousePointer, KeyRound, Shield, Plus, ArrowRight,
  BookOpen, Users, BarChart3, TrendingDown, Zap, ChevronRight, Target
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const mockTrend = [
  { month: "Nov", clickRate: 32 },
  { month: "Dec", clickRate: 28 },
  { month: "Jan", clickRate: 24 },
  { month: "Feb", clickRate: 19 },
  { month: "Mar", clickRate: 15 },
  { month: "Apr", clickRate: 11 },
  { month: "May", clickRate: 8 },
];

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed: { label: "Completed", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  paused: { label: "Paused", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export default function Dashboard() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const org = orgsData?.[0]?.org;
  const orgId = org?.id;

  const { data: analytics } = trpc.analytics.overview.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: campaigns } = trpc.campaigns.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: targets } = trpc.targets.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });

  const seedMutation = trpc.seed.seedBuiltIns.useMutation({
    onSuccess: () => toast.success("Built-in templates and training modules loaded!"),
    onError: (e) => toast.error(e.message),
  });

  const stats = analytics?.stats;
  const sent = stats?.sent ?? 0;
  const clicked = stats?.clicked ?? 0;
  const submitted = stats?.submitted ?? 0;

  const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : "0";
  const submitRate = sent > 0 ? ((submitted / sent) * 100).toFixed(1) : "0";

  const recentCampaigns = useMemo(() => (campaigns ?? []).slice(0, 5), [campaigns]);
  const activeCampaigns = (campaigns ?? []).filter(c => c.status === "active").length;

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Welcome banner */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-1">Welcome back, {firstName} 👋</h2>
              <p className="text-sm text-muted-foreground">
                {org?.name} · {activeCampaigns > 0 ? `${activeCampaigns} active campaign${activeCampaigns > 1 ? "s" : ""}` : "No active campaigns"}
              </p>
            </div>
            <Button onClick={() => navigate("/campaigns")} className="hidden sm:flex">
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Emails Sent", value: sent.toLocaleString(), icon: Mail, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Avg Click Rate", value: `${clickRate}%`, icon: MousePointer, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "Cred Submissions", value: `${submitRate}%`, icon: KeyRound, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "Security Score", value: `${analytics?.postureScore ?? 0}`, icon: Shield, color: "text-primary", bg: "bg-primary/10", suffix: "/100" },
          ].map((s) => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-5">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className="text-2xl font-bold mb-0.5">
                  {s.value}
                  {(s as any).suffix && <span className="text-sm font-normal text-muted-foreground">{(s as any).suffix}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Click rate trend */}
          <Card className="lg:col-span-2 border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Click Rate Trend</CardTitle>
                <div className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <TrendingDown className="w-3.5 h-3.5" />
                  -75% over 7 months
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={mockTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.62 0.22 265)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.62 0.22 265)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 260)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.55 0.02 260)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.02 260)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.13 0.015 260)", border: "1px solid oklch(0.22 0.02 260)", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="clickRate" stroke="oklch(0.62 0.22 265)" strokeWidth={2} fill="url(#clickGrad)" name="Click Rate %" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Create Campaign", desc: "Launch a new phishing test", icon: Target, path: "/campaigns", color: "text-primary bg-primary/10" },
                { label: "Add Employees", desc: `${targets?.length ?? 0} employees in system`, icon: Users, path: "/targets", color: "text-blue-400 bg-blue-500/10" },
                { label: "Browse Templates", desc: "AI-powered template library", icon: Mail, path: "/templates", color: "text-violet-400 bg-violet-500/10" },
                { label: "View Analytics", desc: "Department risk breakdown", icon: BarChart3, path: "/analytics", color: "text-amber-400 bg-amber-500/10" },
                { label: "Start Training", desc: "15+ security modules", icon: BookOpen, path: "/training", color: "text-emerald-400 bg-emerald-500/10" },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left group"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color.split(" ")[1]}`}>
                    <a.icon className={`w-4 h-4 ${a.color.split(" ")[0]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground">{a.desc}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 group-hover:text-muted-foreground transition-colors" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Recent campaigns */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Campaigns</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => navigate("/campaigns")}>
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentCampaigns.length === 0 ? (
              <div className="text-center py-8">
                <Mail className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No campaigns yet. Create your first one!</p>
                <Button size="sm" onClick={() => navigate("/campaigns")}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create Campaign
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentCampaigns.map((c) => {
                  const sc = statusConfig[c.status] ?? statusConfig.draft;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/campaigns/${c.id}`)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</div>
                      </div>
                      <Badge variant="outline" className={`text-xs border flex-shrink-0 ${sc.className}`}>
                        {sc.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seed button for first-time setup */}
        {sent === 0 && (campaigns ?? []).length === 0 && (
          <Card className="border-border/60 border-dashed">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <div className="font-medium text-sm">Load Built-in Content</div>
                  <div className="text-xs text-muted-foreground">Seed templates and training modules to get started quickly.</div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={seedMutation.isPending}
                onClick={() => seedMutation.mutate()}
              >
                {seedMutation.isPending ? "Loading..." : "Load Content"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
