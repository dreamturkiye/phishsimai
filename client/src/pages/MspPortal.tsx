import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2, Users, Shield, Plus, Settings, Activity,
  CheckCircle2, AlertCircle, Clock, ExternalLink, Palette,
  Globe, Mail, Phone, BarChart3, ChevronRight, Zap,
  FileText, Send, Trash2, Eye, Code
} from "lucide-react";
import { getLoginUrl } from "@/const";

// ─── Registration Form ────────────────────────────────────────────────────────
const registerSchema = z.object({
  companyName: z.string().min(2, "Company name required"),
  contactEmail: z.string().email("Valid email required"),
  contactPhone: z.string().optional(),
  website: z.string().optional(),
});
type RegisterForm = z.infer<typeof registerSchema>;

// ─── Provision Form ───────────────────────────────────────────────────────────
const provisionSchema = z.object({
  orgName: z.string().min(2, "Organization name required"),
  orgSlug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  adminEmail: z.string().email("Valid admin email required"),
  plan: z.enum(["starter", "professional", "enterprise"]),
  notes: z.string().optional(),
});
type ProvisionForm = z.infer<typeof provisionSchema>;

// ─── Branding Form ────────────────────────────────────────────────────────────
const brandingSchema = z.object({
  brandName: z.string().optional(),
  brandPrimaryColor: z.string().optional(),
  brandSupportEmail: z.string().email().optional().or(z.literal("")),
  brandCustomDomain: z.string().optional(),
});
type BrandingForm = z.infer<typeof brandingSchema>;

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    suspended: { label: "Suspended", className: "bg-red-500/15 text-red-400 border-red-500/30" },
    pending: { label: "Pending", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    trial: { label: "Trial", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  };
  const s = map[status] ?? { label: status, className: "bg-secondary text-muted-foreground border-border" };
  return <Badge variant="outline" className={`text-xs border ${s.className}`}>{s.label}</Badge>;
}

// ─── Plan badge ───────────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    starter: "bg-secondary text-muted-foreground border-border",
    professional: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    enterprise: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };
  return (
    <Badge variant="outline" className={`text-xs border capitalize ${map[plan] ?? ""}`}>{plan}</Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MspPortal() {
  const { user, isAuthenticated, loading } = useAuth();
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("customers");

  const { data: tenant, refetch: refetchTenant } = trpc.msp.getMyTenant.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: customers = [], refetch: refetchCustomers } = trpc.msp.listCustomers.useQuery(undefined, {
    enabled: !!tenant,
  });
  const { data: activityLog = [] } = trpc.msp.getActivityLog.useQuery(undefined, {
    enabled: !!tenant,
  });

  const registerMutation = trpc.msp.register.useMutation({
    onSuccess: () => { toast.success("MSP account registered!"); refetchTenant(); },
    onError: (e) => toast.error(e.message),
  });
  const provisionMutation = trpc.msp.provisionCustomer.useMutation({
    onSuccess: () => { toast.success("Customer provisioned successfully!"); setProvisionOpen(false); refetchCustomers(); },
    onError: (e) => toast.error(e.message),
  });
  const updateBrandingMutation = trpc.msp.updateBranding.useMutation({
    onSuccess: () => { toast.success("Branding updated!"); refetchTenant(); },
    onError: (e) => toast.error(e.message),
  });
  const updateStatusMutation = trpc.msp.updateCustomerStatus.useMutation({
    onSuccess: () => { toast.success("Customer status updated!"); refetchCustomers(); },
    onError: (e) => toast.error(e.message),
  });
  // BUG-02 FIX: impersonation stores org context in localStorage then navigates to dashboard
  const [, navigate] = useLocation();
  const impersonateMutation = trpc.msp.impersonateCustomer.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("msp_managed_org", JSON.stringify({ orgId: data.orgId, orgName: data.orgName }));
      toast.success(`Now managing ${data.orgName}`);
      navigate("/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  const provisionForm = useForm<ProvisionForm>({
    resolver: zodResolver(provisionSchema),
    defaultValues: { plan: "starter" },
  });
  const brandingForm = useForm<BrandingForm>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      brandName: tenant?.brandName ?? "",
      brandPrimaryColor: tenant?.brandPrimaryColor ?? "#6366f1",
      brandSupportEmail: tenant?.brandSupportEmail ?? "",
      brandCustomDomain: tenant?.brandCustomDomain ?? "",
    },
  });

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-8 h-8 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold mb-3">MSP Partner Portal</h1>
          <p className="text-muted-foreground mb-6">Sign in to access the PhishSim AI MSP portal and manage your customer organizations.</p>
          <Button onClick={() => window.location.href = getLoginUrl()}>Sign In to Continue</Button>
        </div>
      </div>
    );
  }

  // ── Registration flow ──────────────────────────────────────────────────────
  if (!loading && !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-violet-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Become a PhishSim AI Partner</h1>
            <p className="text-muted-foreground">Register as an MSP to provision and manage customer organizations with white-label branding.</p>
          </div>

          {/* Benefits */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { icon: Users, label: "Manage unlimited customers", color: "text-violet-400", bg: "bg-violet-500/10" },
              { icon: Palette, label: "Full white-label branding", color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { icon: BarChart3, label: "Consolidated reporting", color: "text-emerald-400", bg: "bg-emerald-500/10" },
            ].map(({ icon: Icon, label, color, bg }) => (
              <div key={label} className="text-center p-4 rounded-xl border border-border/60 bg-card">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
              </div>
            ))}
          </div>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Register Your MSP Account</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={registerForm.handleSubmit((d) => registerMutation.mutate(d))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Company Name *</Label>
                  <Input placeholder="Acme IT Services" {...registerForm.register("companyName")} />
                  {registerForm.formState.errors.companyName && (
                    <p className="text-xs text-red-400">{registerForm.formState.errors.companyName.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Email *</Label>
                  <Input type="email" placeholder="admin@acmeit.com" {...registerForm.register("contactEmail")} />
                  {registerForm.formState.errors.contactEmail && (
                    <p className="text-xs text-red-400">{registerForm.formState.errors.contactEmail.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone (optional)</Label>
                    <Input placeholder="443-000-0000" {...registerForm.register("contactPhone")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Website (optional)</Label>
                    <Input placeholder="https://acmeit.com" {...registerForm.register("website")} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? "Registering..." : "Register as MSP Partner"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── MSP Dashboard ──────────────────────────────────────────────────────────
  const activeCustomers = customers.filter(c => c.customer.status === "active").length;
  const suspendedCustomers = customers.filter(c => c.customer.status === "suspended").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">{tenant?.brandName ?? tenant?.companyName ?? "MSP Portal"}</div>
              <div className="text-xs text-muted-foreground">PhishSim AI Partner</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={tenant?.status ?? "trial"} />
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/dashboard"}>
              <ExternalLink className="w-3 h-3 mr-1.5" />
              My Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Customers", value: customers.length, icon: Users, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "Active", value: activeCustomers, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Suspended", value: suspendedCustomers, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "Customer Limit", value: `${customers.length} / ${tenant?.maxCustomers ?? 10}`, icon: Shield, color: "text-amber-400", bg: "bg-amber-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold mb-0.5">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="templates">Template Library</TabsTrigger>
              <TabsTrigger value="branding">White Label</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
            </TabsList>
            {activeTab === "customers" && (
              <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Provision Customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Provision New Customer</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={provisionForm.handleSubmit((d) => provisionMutation.mutate(d))} className="space-y-4 mt-2">
                    <div className="space-y-1.5">
                      <Label>Organization Name *</Label>
                      <Input placeholder="Acme Corp" {...provisionForm.register("orgName")} />
                      {provisionForm.formState.errors.orgName && (
                        <p className="text-xs text-red-400">{provisionForm.formState.errors.orgName.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>URL Slug * <span className="text-muted-foreground text-xs">(lowercase, no spaces)</span></Label>
                      <Input placeholder="acme-corp" {...provisionForm.register("orgSlug")} />
                      {provisionForm.formState.errors.orgSlug && (
                        <p className="text-xs text-red-400">{provisionForm.formState.errors.orgSlug.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Admin Email *</Label>
                      <Input type="email" placeholder="admin@acmecorp.com" {...provisionForm.register("adminEmail")} />
                      {provisionForm.formState.errors.adminEmail && (
                        <p className="text-xs text-red-400">{provisionForm.formState.errors.adminEmail.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <Select
                        defaultValue="starter"
                        onValueChange={(v) => provisionForm.setValue("plan", v as "starter" | "professional" | "enterprise")}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter — up to 50 employees</SelectItem>
                          <SelectItem value="professional">Professional — up to 500 employees</SelectItem>
                          <SelectItem value="enterprise">Enterprise — unlimited</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes (optional)</Label>
                      <Textarea placeholder="Internal notes about this customer..." rows={2} {...provisionForm.register("notes")} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setProvisionOpen(false)}>Cancel</Button>
                      <Button type="submit" className="flex-1" disabled={provisionMutation.isPending}>
                        {provisionMutation.isPending ? "Provisioning..." : "Provision Customer"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Customers Tab */}
          <TabsContent value="customers">
            {customers.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border/60 rounded-xl">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No customers yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Provision your first customer organization to get started.</p>
                <Button size="sm" onClick={() => setProvisionOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Provision First Customer
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {customers.map(({ customer, org }) => (
                  <Card key={customer.id} className="border-border/60 hover:border-border transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-5 h-5 text-violet-400" />
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{org?.name ?? "Unknown Org"}</div>
                            <div className="text-xs text-muted-foreground">
                              {customer.adminEmail} · /{org?.slug}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <PlanBadge plan={customer.plan} />
                          <StatusBadge status={customer.status} />
                          <Select
                            value={customer.status}
                            onValueChange={(v) => updateStatusMutation.mutate({
                              customerOrgId: customer.id,
                              status: v as "active" | "suspended" | "pending",
                            })}
                          >
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Set Active</SelectItem>
                              <SelectItem value="suspended">Suspend</SelectItem>
                              <SelectItem value="pending">Set Pending</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={impersonateMutation.isPending}
                            onClick={() => impersonateMutation.mutate({ customerOrgId: customer.id })}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {impersonateMutation.isPending ? "Loading..." : "Manage"}
                          </Button>
                        </div>
                      </div>
                      {customer.notes && (
                        <p className="text-xs text-muted-foreground mt-3 pl-14">{customer.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* White Label Branding Tab */}
          <TabsContent value="branding">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="w-4 h-4 text-violet-400" />
                    Brand Identity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={brandingForm.handleSubmit((d) => updateBrandingMutation.mutate(d))} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Brand Name</Label>
                      <Input placeholder="Your Company Name" {...brandingForm.register("brandName")} />
                      <p className="text-xs text-muted-foreground">Displayed in the portal header instead of "PhishSim AI"</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Primary Brand Color</Label>
                      <div className="flex gap-2">
                        <Input type="color" className="w-12 h-9 p-1 cursor-pointer" {...brandingForm.register("brandPrimaryColor")} />
                        <Input placeholder="#6366f1" {...brandingForm.register("brandPrimaryColor")} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Support Email</Label>
                      <Input type="email" placeholder="support@yourcompany.com" {...brandingForm.register("brandSupportEmail")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Custom Domain</Label>
                      <Input placeholder="phishing.yourcompany.com" {...brandingForm.register("brandCustomDomain")} />
                      <p className="text-xs text-muted-foreground">Contact us to configure DNS after entering your domain</p>
                    </div>
                    <Button type="submit" disabled={updateBrandingMutation.isPending}>
                      {updateBrandingMutation.isPending ? "Saving..." : "Save Branding"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    White Label Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{ background: brandingForm.watch("brandPrimaryColor") ?? "#6366f1" }}
                      >
                        <Shield className="w-3 h-3 text-white" />
                      </div>
                      <span className="font-semibold text-sm">
                        {brandingForm.watch("brandName") || tenant?.companyName || "Your Brand"}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {["Dashboard", "Campaigns", "Training", "Compliance"].map(item => (
                        <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5 rounded hover:bg-secondary/50">
                          <ChevronRight className="w-3 h-3" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      {brandingForm.watch("brandSupportEmail") || "support@yourcompany.com"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5" />
                      {brandingForm.watch("brandCustomDomain") || "phishing.yourcompany.com"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Log Tab */}
          <TabsContent value="activity">
            {activityLog.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border/60 rounded-xl">
                <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityLog.map((log) => (
                  <div key={log.id} className="flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-card">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                        {log.targetOrgId && (
                          <Badge variant="outline" className="text-xs">Org #{log.targetOrgId}</Badge>
                        )}
                      </div>
                      {log.details && <p className="text-xs text-muted-foreground">{log.details}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── MSP Template Library Tab ─── */}
          <TabsContent value="templates">
            <MspTemplateLibrary customers={customers} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── MSP Template Library Component ─────────────────────────────────────────
function MspTemplateLibrary({ customers }: { customers: Array<{ org: { id: number; name: string; slug: string; logoUrl: string | null; gamificationEnabled: boolean; trainingEnabled: boolean; createdAt: Date; updatedAt: Date } | null; customer: { status: string } }> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<{ name: string; htmlBody: string } | null>(null);
  const [pushingId, setPushingId] = useState<number | null>(null);

  const { data: mspTemplates = [], refetch } = trpc.msp.listMspTemplates.useQuery();

  const createMutation = trpc.msp.createMspTemplate.useMutation({
    onSuccess: () => { toast.success("MSP template created!"); setCreateOpen(false); refetch(); createForm.reset(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.msp.deleteMspTemplate.useMutation({
    onSuccess: () => { toast.success("Template deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const pushMutation = trpc.msp.pushTemplateToCustomers.useMutation({
    onSuccess: (d) => { toast.success(`Pushed to ${d.pushed} customer org(s)!`); setPushingId(null); },
    onError: (e) => { toast.error(e.message); setPushingId(null); },
  });

  const createSchema = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    htmlBody: z.string().min(1),
    attackType: z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
    industry: z.string().optional(),
    tags: z.string().optional(),
  });
  const createForm = useForm({ resolver: zodResolver(createSchema), defaultValues: { attackType: "credential_harvest" as const, difficulty: "medium" as const } });
  const [liveHtml, setLiveHtml] = useState("");

  const handleCreate = createForm.handleSubmit((d) => {
    createMutation.mutate({
      name: d.name,
      subject: d.subject,
      htmlBody: d.htmlBody,
      attackType: d.attackType,
      difficulty: d.difficulty,
      industry: d.industry,
      tags: d.tags ? d.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
  });

  const activeCustomerOrgs = customers.filter(c => c.customer.status === "active");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">MSP Template Library</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Private templates visible only to you. Push to any or all customer orgs.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New MSP Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create MSP Template</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Template Name *</Label>
                  <Input placeholder="Chase Bank — Suspicious Login" {...createForm.register("name")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email Subject Line *</Label>
                  <Input placeholder="Action Required: Verify your account" {...createForm.register("subject")} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Attack Type</Label>
                  <Select defaultValue="credential_harvest" onValueChange={v => createForm.setValue("attackType", v as "credential_harvest" | "link_click" | "attachment" | "vishing" | "smishing" | "pretexting")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credential_harvest">Credential Harvest</SelectItem>
                      <SelectItem value="link_click">Link Click</SelectItem>
                      <SelectItem value="attachment">Attachment</SelectItem>
                      <SelectItem value="pretexting">Pretexting / BEC</SelectItem>
                      <SelectItem value="smishing">Smishing</SelectItem>
                      <SelectItem value="vishing">Vishing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <Select defaultValue="medium" onValueChange={v => createForm.setValue("difficulty", v as "easy" | "medium" | "hard")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Industry (optional)</Label>
                  <Input placeholder="Finance, Healthcare..." {...createForm.register("industry")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tags (comma-separated)</Label>
                <Input placeholder="banking, urgent, login" {...createForm.register("tags")} />
              </div>
              {/* HTML Editor + Live Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-muted-foreground" />
                  <Label>HTML Email Body *</Label>
                  <span className="text-xs text-muted-foreground ml-auto">Live preview updates as you type</span>
                </div>
                <div className="grid grid-cols-2 gap-3 h-72">
                  <Textarea
                    placeholder="Paste HTML from a real email or write your own..."
                    className="h-full font-mono text-xs resize-none"
                    {...createForm.register("htmlBody", {
                      onChange: (e) => setLiveHtml(e.target.value),
                    })}
                  />
                  <div className="border border-border/60 rounded-lg overflow-hidden bg-white">
                    <div className="bg-secondary/50 px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
                      <Eye className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Live Preview</span>
                    </div>
                    <iframe
                      srcDoc={liveHtml || "<p style='font-family:sans-serif;color:#999;padding:16px'>Start typing HTML to see a live preview...</p>"}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      title="Email Preview"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                  {createMutation.isPending ? "Saving..." : "Save MSP Template"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Template List */}
      {mspTemplates.length === 0 ? (
        <Card className="border-border/60 border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No MSP templates yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1 mb-4">Create templates here and push them to any or all of your customer organizations.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {mspTemplates.map(t => (
            <Card key={t.id} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{t.name}</span>
                      <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{t.difficulty}</Badge>
                      <Badge variant="outline" className="text-xs flex-shrink-0">{t.attackType.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">Subject: {t.subject}</p>
                    {t.industry && <p className="text-xs text-muted-foreground/70 mt-0.5">Industry: {t.industry}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewTemplate({ name: t.name, htmlBody: t.htmlBody })}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pushingId === t.id || pushMutation.isPending}
                      onClick={() => {
                        setPushingId(t.id);
                        pushMutation.mutate({ templateId: t.id });
                      }}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      {pushingId === t.id ? "Pushing..." : `Push to All (${activeCustomerOrgs.length})`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteMutation.mutate({ templateId: t.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="border border-border/60 rounded-lg overflow-hidden bg-white h-96">
            <iframe
              srcDoc={previewTemplate?.htmlBody ?? ""}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
              title="Template Preview"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
