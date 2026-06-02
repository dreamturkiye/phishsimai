import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award, Shield, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";

const mockLeaderboard = [
  { rank: 1, name: "Sarah Chen", dept: "IT", score: 98, trend: "up", badge: "Security Champion" },
  { rank: 2, name: "Marcus Rodriguez", dept: "Management", score: 94, trend: "up", badge: "Vigilant" },
  { rank: 3, name: "Aisha Patel", dept: "Finance", score: 91, trend: "same", badge: "Aware" },
  { rank: 4, name: "James Wilson", dept: "Sales", score: 87, trend: "up", badge: "Improving" },
  { rank: 5, name: "Emma Thompson", dept: "Operations", score: 82, trend: "down", badge: null },
  { rank: 6, name: "David Kim", dept: "Finance", score: 78, trend: "up", badge: null },
  { rank: 7, name: "Lisa Martinez", dept: "Warehouse", score: 71, trend: "same", badge: null },
  { rank: 8, name: "Tom Anderson", dept: "Sales", score: 65, trend: "down", badge: null },
];

const riskData = [
  { dept: "IT", score: 95, employees: 12, risk: "low" },
  { dept: "Management", score: 88, employees: 8, risk: "low" },
  { dept: "Finance", score: 72, employees: 18, risk: "medium" },
  { dept: "Sales", score: 68, employees: 24, risk: "medium" },
  { dept: "Operations", score: 61, employees: 31, risk: "medium" },
  { dept: "Warehouse", score: 45, employees: 42, risk: "high" },
];

const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];
const rankIcons = [Trophy, Medal, Award];

export default function Gamification() {
  const { isAuthenticated } = useAuth();

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const { orgId } = useActiveOrg();

  const { data: leaderboard } = trpc.gamification.leaderboard.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId }
  );

  const displayLeaderboard = (leaderboard?.scores && leaderboard.scores.length > 0) ? leaderboard.scores : mockLeaderboard;

  return (
    <AppLayout title="Leaderboard & Risk Scores">
      <div className="space-y-6">
        {/* Org posture */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Org Security Score", value: "76", icon: Shield, color: "text-primary", bg: "bg-primary/10", suffix: "/100" },
            { label: "Top Performers", value: "3", icon: Trophy, color: "text-yellow-400", bg: "bg-yellow-500/10", suffix: " champions" },
            { label: "At-Risk Employees", value: "12", icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10", suffix: " flagged" },
            { label: "Avg Improvement", value: "+14%", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", suffix: " this month" },
          ].map((s) => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-5">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className="text-2xl font-bold mb-0.5">{s.value}<span className="text-sm font-normal text-muted-foreground">{s.suffix}</span></div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Leaderboard */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                Employee Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {displayLeaderboard.slice(0, 8).map((entry: any, i: number) => {
                const RankIcon = rankIcons[i] ?? null;
                const rankColor = rankColors[i] ?? "text-muted-foreground";
                return (
                  <div
                    key={entry.rank ?? i}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${i < 3 ? "bg-accent/40" : "hover:bg-accent/20"}`}
                  >
                    <div className={`w-7 text-center font-bold text-sm ${rankColor}`}>
                      {RankIcon ? <RankIcon className="w-4 h-4 mx-auto" /> : `#${entry.rank ?? i + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{entry.name ?? `Employee ${i + 1}`}</div>
                      <div className="text-xs text-muted-foreground">{entry.dept ?? "—"}</div>
                    </div>
                    {entry.badge && (
                      <Badge className="bg-primary/10 text-primary border border-primary/20 text-xs h-5 px-1.5">
                        <Star className="w-2.5 h-2.5 mr-1" />
                        {entry.badge}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5">
                      {entry.trend === "up" && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                      {entry.trend === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
                      {entry.trend === "same" && <Minus className="w-3 h-3 text-muted-foreground" />}
                      <span className="font-bold text-sm w-8 text-right">{entry.score ?? entry.securityScore ?? 0}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Department risk scores */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Department Risk Scores
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {riskData.map((d) => (
                <div key={d.dept}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{d.dept}</span>
                      <span className="text-xs text-muted-foreground">{d.employees} employees</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs border ${
                          d.risk === "high"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : d.risk === "medium"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        {d.risk} risk
                      </Badge>
                      <span className={`font-bold text-sm ${
                        d.score >= 80 ? "text-emerald-400" : d.score >= 60 ? "text-amber-400" : "text-red-400"
                      }`}>{d.score}</span>
                    </div>
                  </div>
                  <Progress
                    value={d.score}
                    className="h-1.5"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
