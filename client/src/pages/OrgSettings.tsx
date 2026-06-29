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
import { Settings, Users, Mail, Shield, Plus, Trash2, Crown, UserCheck, Copy, CheckCheck, Clock, CreditCard, Check } from "lucide-react";


const PS_PLANS = [
  { id: 'starter', name: 'Starter', mo: 149, yr: 1490, mid: 'price_1Tnerf2LZ4pKabuO9rvqy2YI', yid: 'price_1Tnerg2LZ4pKabuOLZFS26Bx', desc: 'Perfect for small MSPs', hot: false, features: ['1 client org', '25 users', '5 phishing templates/mo', 'AI template generator', 'Basic analytics', 'Email support'] },
  { id: 'growth', name: 'Growth', mo: 299, yr: 2990, mid: 'price_1Tnerg2LZ4pKabuOJxHALY09', yid: 'price_1Tnerg2LZ4pKabuOz9QIeU9Q', desc: 'MSP-ready for growing teams', hot: true, badge: 'Most Popular', features: ['5 client orgs', '100 users', '15 templates/mo', 'ConnectWise CSV import', 'Click + open tracking', 'Outlook add-in', 'Priority support'] },
  { id: 'pro', name: 'Pro', mo: 749, yr: 7490, mid: 'price_1Tnerg2LZ4pKabuOV7I9j3Y3', yid: 'price_1Tnerg2LZ4pKabuOHP33vjg5', desc: 'Unlimited scale for MSPs', hot: false, features: ['20 client orgs', '500 users', 'Unlimited templates', 'HIPAA/SOC2/PCI reporting', 'CRM integration', 'Dedicated CSM'] },
  { id: 'enterprise', name: 'Enterprise', mo: 1499, yr: 14990, mid: 'price_1Tnerh2LZ4pKabuOLn8Y4Y2t', yid: 'price_1Tnerh2LZ4pKabuOFGxflEVj', desc: 'Unlimited everything', hot: false, features: ['Unlimited client orgs', 'Unlimited users', 'White-label portal', 'Custom domain', 'API access', 'SLA guarantee'] },
] as const

function BillingTabContent({ orgId }: { orgId?: number }) {
  const [annual, setAnnual] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (d) => { if (d.url) window.location.href = d.url },
    onError: (e) => { toast.error(e.message || 'Checkout failed'); setLoading(null) },
  })
  const portal = trpc.billing.getBillingPortalUrl.useMutation({
    onSuccess: (d) => { if (d.url) window.location.href = d.url },
    onError: (e) => toast.error(e.message),
  })
  function upgrade(plan: typeof PS_PLANS[number]) {
    if (!orgId) return toast.error('No organization selected')
    const pid = annual ? plan.yid : plan.mid
    if (!pid) return toast.error('Price not configured')
    setLoading(plan.id)
    checkout.mutate({ orgId, priceId: pid, billingInterval: annual ? 'annual' : 'monthly' })
  }
  return (
    <div className='space-y-5'>
      <div>
        <h3 className='text-sm font-semibold mb-1'>Subscription Plans</h3>
        <p className='text-xs text-muted-foreground'>All plans include a 7-day free trial. No credit card required.</p>
      </div>
      <div className='flex items-center gap-3'>
        <span className={`text-xs font-medium ${!annual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
        <button onClick={() => setAnnual(a => !a)} className={`relative w-10 h-5 rounded-full transition-colors ${annual ? 'bg-primary' : 'bg-muted'}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${annual ? 'left-5' : 'left-0.5'}`} />
        </button>
        <span className={`text-xs font-medium ${annual ? 'text-foreground' : 'text-muted-foreground'}`}>Annual <span className='text-green-500 font-bold'>Save 17%</span></span>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        {PS_PLANS.map(plan => (
          <Card key={plan.id} className={`relative border ${plan.hot ? 'border-primary' : 'border-border/60'}`}>
            {'badge' in plan && <div className='absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-0.5 rounded-full'>{(plan as any).badge}</div>}
            <CardContent className='p-4 space-y-3'>
              <div>
                <div className='text-xs text-muted-foreground uppercase tracking-wide font-semibold'>{plan.name}</div>
                <div className='flex items-baseline gap-1 mt-1'>
                  <span className='text-2xl font-black'>${annual ? Math.round(plan.yr / 12) : plan.mo}</span>
                  <span className='text-xs text-muted-foreground'>/mo</span>
                </div>
                {annual && <div className='text-xs text-green-500 font-medium'>Billed ${plan.yr}/yr</div>}
                <div className='text-xs text-muted-foreground mt-1'>{plan.desc}</div>
              </div>
              <ul className='space-y-1'>
                {plan.features.map(f => (
                  <li key={f} className='flex items-start gap-1.5 text-xs text-muted-foreground'>
                    <Check className='w-3 h-3 text-primary mt-0.5 shrink-0' />{f}
                  </li>
                ))}
              </ul>
              <Button size='sm' className='w-full text-xs' variant={plan.hot ? 'default' : 'outline'} disabled={loading === plan.id} onClick={() => upgrade(plan)}>
                {loading === plan.id ? 'Loading...' : 'Start Free Trial'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='pt-2 border-t border-border/40'>
        <Button variant='ghost' size='sm' className='text-xs text-muted-foreground' onClick={() => orgId && portal.mutate({ orgId })}>
          Manage existing subscription
        </Button>
      </div>
    </div>
  )
}


export default function OrgSettings() {
  const { isAuthenticated, user } = useAuth();
  const [tab, setTab] = useState("general");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  // BUG-04 FIX: track generated invite link and copy state
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: orgsData, refetch: refetchOrgs } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const org = orgsData?.[0]?.org;
  const orgId = org?.id;
  const myRole = orgsData?.[0]?.role;

  const { data: members, refetch: refetchMembers } = trpc.orgs.members.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId }
  );

  // BUG-13 FIX: fetch pending invites to show with copy link
  const { data: pendingInvites = [], refetch: refetchInvites } = trpc.orgs.invites.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId && myRole === "admin" }
  );

  const updateOrgMutation = trpc.orgs.update.useMutation({
    onSuccess: () => { toast.success("Settings saved"); refetchOrgs(); },
    onError: (e) => toast.error(e.message),
  });

  // BUG-04 FIX: onSuccess now shows the invite link instead of closing
  const inviteMutation = trpc.orgs.invite.useMutation({
    onSuccess: (data) => {
      const link = `${window.location.origin}/invite/${data.token}`;
      setInviteLink(link);
      refetchMembers();
      refetchInvites();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMemberMutation = trpc.orgs.removeMember.useMutation({
    onSuccess: () => { toast.success("Member removed"); refetchMembers(); },
    onError: (e) => toast.error(e.message),
  });

  const [orgName, setOrgName] = useState(org?.name ?? "");
  const [gamificationEnabled, setGamificationEnabled] = useState(org?.gamificationEnabled ?? true);
  const [trainingEnabled, setTrainingEnabled] = useState(org?.trainingEnabled ?? true);

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseInviteDialog = () => {
    setShowInvite(false);
    setInviteEmail("");
    setInviteLink("");
    setCopied(false);
  };

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
            <TabsTrigger value="billing" className="text-xs h-6 px-3">
              <CreditCard className="w-3 h-3 mr-1.5" />Billing
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

            {/* BUG-13 FIX: Pending invites with copy link */}
            {myRole === "admin" && pendingInvites.filter(i => !i.acceptedAt).length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Pending Invitations ({pendingInvites.filter(i => !i.acceptedAt).length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {pendingInvites.filter(i => !i.acceptedAt).map((inv) => {
                      const invLink = `${window.location.origin}/invite/${inv.token}`;
                      const isExpired = new Date(inv.expiresAt) < new Date();
                      return (
                        <div key={inv.token} className="flex items-center gap-3 p-3 rounded-lg border border-border/40">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{inv.email}</div>
                            <div className="text-xs text-muted-foreground">
                              {isExpired ? (
                                <span className="text-red-400">Expired</span>
                              ) : (
                                <>Expires {new Date(inv.expiresAt).toLocaleDateString()} · {inv.role}</>
                              )}
                            </div>
                          </div>
                          {!isExpired && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-shrink-0"
                              onClick={() => handleCopyLink(invLink)}
                            >
                              <Copy className="w-3 h-3 mr-1.5" />
                              Copy Link
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
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
          <TabsContent value="billing" className="mt-4"><BillingTabContent orgId={org?.id} /></TabsContent>
        </Tabs>
      </div>

      {/* Invite dialog — BUG-04 FIX: shows copyable link after creation */}
      <Dialog open={showInvite} onOpenChange={handleCloseInviteDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>

          {inviteLink ? (
            /* Step 2: Show the invite link */
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <CheckCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-emerald-400 font-medium">Invite link created!</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Share this link with {inviteEmail}</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteLink}
                    className="bg-background border-border/60 text-xs font-mono"
                  />
                  <Button size="sm" variant="outline" onClick={() => handleCopyLink(inviteLink)} className="flex-shrink-0">
                    {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Link expires in 7 days. Anyone with this link can join your organization.</p>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseInviteDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            /* Step 1: Enter email and role */
            <>
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
                <Button variant="outline" onClick={handleCloseInviteDialog}>Cancel</Button>
                <Button
                  disabled={!inviteEmail || inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate({ orgId: orgId!, email: inviteEmail, role: inviteRole })}
                >
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  {inviteMutation.isPending ? "Creating..." : "Create Invite Link"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
