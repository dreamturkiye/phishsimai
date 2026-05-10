import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { BarChart3, TrendingDown, Shield, Mail, MousePointer, KeyRound, Info } from "lucide-react";

// Illustrative demo data shown when no real campaigns exist yet
const demoTrend = [
  { name: "Q1 Campaign", openRate: 68, clickRate: 32, submitRate: 12 },
  { name: "Q2 Campaign", openRate: 62, clickRate: 28, submitRate: 9 },
  { name: "Q3 Campaign", openRate: 58, clickRate: 24, submitRate: 7 },
  { name: "Q4 Campaign", openRate: 52, clickRate: 19, submitRate: 5 },
  { name: "Q5 Campaign", openRate: 47, clickRate: 15, submitRate: 4 },
  { name: "Q6 Campaign", openRate: 41, clickRate: 11, submitRate: 2 },
];

const demoDept = [
  { dept: "Finance", clickRate: 22, openRate: 65 },
  { dept: "Sales", clickRate: 15, openRate: 58 },
  { dept: "Management", clickRate: 8, openRate: 42 },
  { dept: "Operations", clickRate: 18, openRate: 61 },
  { dept: "Warehouse", clickRate: 28, openRate: 70 },
];

const tooltipStyle = {
  contentStyle: { background: "oklch(0.13 0.015 260)", border: "1px solid oklch(0.22 0.02 260)", borderRadius: "8px", fontSize: 12 },
  labelStyle: { color: "oklch(0.95 0.01 260)" },
};

export default function Analytics() {
  const { isAuthenticated } = useAuth();

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const orgId = orgsData?.[0]?.org?.id;

  const { data: analytics } = trpc.analytics.overview.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: trendData } = trpc.analytics.campaignTrend.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: deptData } = trpc.analytics.deptBreakdown.useQuery({ orgId: orgId! }, { enabled: !!orgId });

  const stats = analytics?.stats;
  const sent = stats?.sent ?? 0;
  const opened = stats?.opened ?? 0;
  const clicked = stats?.clicked ?? 0;
  const submitted = stats?.submitted ?? 0;

  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0";
  const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : "0";
  const submitRate = sent > 0 ? ((submitted / sent) * 100).toFixed(1) : "0";

  // Use real data if available, fall back to demo data
  const isDemo = !trendData || trendData.length === 0;
  const chartTrend = isDemo ? demoTrend : trendData;
  const chartDept = (!deptData || deptData.every(d => d.clickRate === 0)) ? demoDept : deptData;

  return (
    <AppLayout title="Analytics">
      <div className="space-y-6">
        {/* Top stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Emails Sent", value: sent.toLocaleString(), icon: Mail, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Open Rate", value: `${openRate}%`, icon: Mail, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "Click Rate", value: `${clickRate}%`, icon: MousePointer, color: "text-amber-400", bg: "bg-amber-500/10", trend: "down" },
            { label: "Credential Submit", value: `${submitRate}%`, icon: KeyRound, color: "text-red-400", bg: "bg-red-500/10", trend: "down" },
          ].map((s) => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  {(s as any).trend === "down" && sent > 0 && (
                    <div className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <TrendingDown className="w-3 h-3" />
                      Improving
                    </div>
                  )}
                </div>
                <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Demo notice */}
        {isDemo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border/40 rounded-lg px-4 py-2.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Charts below show illustrative data. Run campaigns to see your real performance trends.
          </div>
        )}

        {/* Trend chart */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Campaign Performance Over Time</CardTitle>
              {isDemo && <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground">Demo Data</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartTrend} margin={{ top: 5, right: 20, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 260)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 260)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.02 260)" }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="openRate" stroke="oklch(0.62 0.22 265)" strokeWidth={2} dot={false} name="Open Rate %" />
                <Line type="monotone" dataKey="clickRate" stroke="oklch(0.68 0.20 35)" strokeWidth={2} dot={false} name="Click Rate %" />
                <Line type="monotone" dataKey="submitRate" stroke="oklch(0.60 0.22 25)" strokeWidth={2} dot={false} name="Submit Rate %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department breakdown */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Click Rate by Department</CardTitle>
                {isDemo && <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground">Demo Data</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartDept} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 260)" />
                  <XAxis dataKey="dept" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 260)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.02 260)" }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="clickRate" fill="oklch(0.68 0.20 35)" radius={[4, 4, 0, 0]} name="Click Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Department Risk Summary</CardTitle>
                {isDemo && <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground">Demo Data</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...chartDept].sort((a, b) => b.clickRate - a.clickRate).map((d) => (
                  <div key={d.dept} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-muted-foreground flex-shrink-0 truncate">{d.dept}</div>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(d.clickRate, 100)}%`,
                          background: d.clickRate > 20
                            ? "oklch(0.60 0.22 25)"
                            : d.clickRate > 10
                              ? "oklch(0.68 0.20 35)"
                              : "oklch(0.70 0.18 145)",
                        }}
                      />
                    </div>
                    <div className={`text-xs font-medium w-10 text-right ${
                      d.clickRate > 20 ? "text-red-400" : d.clickRate > 10 ? "text-amber-400" : "text-emerald-400"
                    }`}>
                      {d.clickRate}%
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs border flex-shrink-0 ${
                        d.clickRate > 20
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : d.clickRate > 10
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {d.clickRate > 20 ? "High" : d.clickRate > 10 ? "Medium" : "Low"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Security posture */}
        <Card className="border-border/60 bg-gradient-to-r from-primary/5 to-emerald-500/5">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-lg">Overall Security Posture</div>
                <div className="text-sm text-muted-foreground">Based on campaign results and training completion</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-5xl font-bold text-primary">{analytics?.postureScore ?? 0}</div>
              <div className="text-sm text-muted-foreground">/ 100</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
