import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Settings, Users, Mail, Shield, Plus, Trash2, Crown, UserCheck } from "lucide-react";

export default function OrgSettings() {
  const { isAuthenticated, user } = useAuth();
  const [tab, setTab] = useState("general");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  const { data: orgsData, refetch: refetchOrgs } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const org = orgsData?.[0]?.org;
  const orgId = org?.id;
  const myRole = orgsData?.[0]?.role;

  const { data: members, refetch: refetchMembers } = trpc.orgs.members.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId }
  );

  const updateOrgMutation = trpc.orgs.update.useMutation({
    onSuccess: () => { toast.success("Settings saved"); refetchOrgs(); },
    onError: (e) => toast.error(e.message),
  });

  const inviteMutation = trpc.orgs.invite.useMutation({
    onSuccess: () => { toast.success("Invitation sent!"); setShowInvite(false); setInviteEmail(""); refetchMembers(); },
    onError: (e) => toast.error(e.message),
  });

  const removeMemberMutation = trpc.orgs.removeMember.useMutation({
    onSuccess: () => { toast.success("Member removed"); refetchMembers(); },
    onError: (e) => toast.error(e.message),
  });

  const [orgName, setOrgName] = useState(org?.name ?? "");
  const [gamificationEnabled, setGamificationEnabled] = useState(org?.gamificationEnabled ?? true);
  const [trainingEnabled, setTrainingEnabled] = useState(org?.trainingEnabled ?? true);

  return (
    <AppLayout title="Organization Settings">
      <div className="max-w-3xl space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-card border border-border/60 h-8">
            <TabsTrigger value="general" className="text-xs h-6 px-3">
              <Settings className="w-3 h-3 mr-1.5" />General
            </TabsTrigger>
            <TabsTrigger value="members" className="text-xs h-6 px-3">
              <Users className="w-3 h-3 mr-1.5" />Members
            </TabsTrigger>
            <TabsTrigger value="features" className="text-xs h-6 px-3">
              <Shield className="w-3 h-3 mr-1.5" />Features
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Organization Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Organization Name</Label>
                  <Input
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    className="bg-background border-border/60 max-w-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Organization ID</Label>
                  <div className="text-xs text-muted-foreground font-mono bg-secondary/50 px-3 py-2 rounded-lg max-w-sm">{org?.id ?? "—"}</div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Created</Label>
                  <div className="text-xs text-muted-foreground">{org?.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"}</div>
                </div>
                <Button
                  size="sm"
                  disabled={!orgName.trim() || updateOrgMutation.isPending}
                  onClick={() => updateOrgMutation.mutate({ orgId: orgId!, name: orgName })}
                >
                  {updateOrgMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="mt-4 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Team Members ({members?.length ?? 0})</CardTitle>
                {myRole === "admin" && (
                  <Button size="sm" onClick={() => setShowInvite(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Invite Member
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(members ?? []).map((m) => (
                    <div key={m.member.userId} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {(m.user?.name ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{m.user?.name ?? "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">{m.user?.email ?? "—"}</div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs border ${m.member.role === "admin" ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground"}`}
                      >
                        {m.member.role === "admin" ? <><Crown className="w-2.5 h-2.5 mr-1" />Admin</> : <><UserCheck className="w-2.5 h-2.5 mr-1" />Member</>}
                      </Badge>
                      {myRole === "admin" && m.member.userId !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive"
                          onClick={() => { if (confirm("Remove this member?")) removeMemberMutation.mutate({ orgId: orgId!, userId: m.member.userId }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="mt-4 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Feature Toggles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  {
                    label: "Gamification & Leaderboards",
                    description: "Enable employee risk scores, leaderboards, and security badges.",
                    value: gamificationEnabled,
                    onChange: (v: boolean) => {
                      setGamificationEnabled(v);
                      updateOrgMutation.mutate({ orgId: orgId!, gamificationEnabled: v });
                    },
                  },
                  {
                    label: "Security Awareness Training",
                    description: "Allow employees to access training modules after phishing simulations.",
                    value: trainingEnabled,
                    onChange: (v: boolean) => {
                      setTrainingEnabled(v);
                      updateOrgMutation.mutate({ orgId: orgId!, trainingEnabled: v });
                    },
                  },
                ].map((f) => (
                  <div key={f.label} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{f.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>
                    </div>
                    <Switch
                      checked={f.value}
                      onCheckedChange={f.onChange}
                      disabled={myRole !== "admin"}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="bg-background border-border/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "member")}>
                <SelectTrigger className="bg-background border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — Can view campaigns and results</SelectItem>
                  <SelectItem value="admin">Admin — Full access to all settings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button
              disabled={!inviteEmail || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate({ orgId: orgId!, email: inviteEmail, role: inviteRole })}
            >
              <Mail className="w-3.5 h-3.5 mr-1.5" />
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
