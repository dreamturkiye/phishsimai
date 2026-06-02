import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, Mail, Search, Calendar, ChevronRight, Trash2,
  FileText, Users, CheckCircle2, Circle, ArrowLeft, ArrowRight
} from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed: { label: "Completed", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  paused: { label: "Paused", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const ATTACK_LABELS: Record<string, string> = {
  link_click: "Link Click",
  attachment: "Attachment",
  vishing: "Vishing",
  smishing: "Smishing",
  pretexting: "Pretexting",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  hard: "bg-red-500/15 text-red-400 border-red-500/30",
};

const STEPS = ["Basics", "Template", "Targets"];

type WizardForm = {
  name: string;
  language: string;
  senderName: string;
  senderEmail: string;
  templateId: number | null;
  selectedTargetIds: number[];
  templateSearch: string;
  targetSearch: string;
};

const DEFAULT_FORM: WizardForm = {
  name: "",
  language: "en",
  senderName: "",
  senderEmail: "",
  templateId: null,
  selectedTargetIds: [],
  templateSearch: "",
  targetSearch: "",
};

export default function Campaigns() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(DEFAULT_FORM);

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const { orgId } = useActiveOrg();

  const { data: campaigns, refetch } = trpc.campaigns.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: templates = [] } = trpc.templates.list.useQuery({ orgId: orgId! }, { enabled: !!orgId && showCreate });
  const { data: targets = [] } = trpc.targets.list.useQuery({ orgId: orgId! }, { enabled: !!orgId && showCreate });

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: (data) => {
      toast.success("Campaign created!");
      setShowCreate(false);
      setForm(DEFAULT_FORM);
      setStep(0);
      refetch();
      navigate(`/campaigns/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => { toast.success("Campaign deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (campaigns ?? []).filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(form.templateSearch.toLowerCase()) ||
    t.subject.toLowerCase().includes(form.templateSearch.toLowerCase())
  );

  const filteredTargets = targets.filter(t =>
    `${t.firstName} ${t.lastName} ${t.email}`.toLowerCase().includes(form.targetSearch.toLowerCase())
  );

  function openWizard() {
    setForm(DEFAULT_FORM);
    setStep(0);
    setShowCreate(true);
  }

  function handleCreate() {
    createMutation.mutate({
      orgId: orgId!,
      name: form.name,
      language: form.language as "en" | "es" | "tr",
      senderName: form.senderName || undefined,
      senderEmail: form.senderEmail || undefined,
      templateId: form.templateId ?? undefined,
      targetIds: form.selectedTargetIds,
    });
  }

  function toggleTarget(id: number) {
    setForm(f => ({
      ...f,
      selectedTargetIds: f.selectedTargetIds.includes(id)
        ? f.selectedTargetIds.filter(x => x !== id)
        : [...f.selectedTargetIds, id],
    }));
  }

  const canProceedStep0 = form.name.trim().length > 0;

  return (
    <AppLayout
      title="Campaigns"
      actions={
        <Button size="sm" onClick={openWizard}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Campaign
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            className="pl-9 h-9 bg-card border-border/60"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Campaign list */}
        {filtered.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="py-16 text-center">
              <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No campaigns yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create your first phishing simulation campaign.</p>
              <Button onClick={openWizard}>
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const sc = statusConfig[c.status] ?? statusConfig.draft;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/30 transition-all cursor-pointer group"
                  onClick={() => navigate(`/campaigns/${c.id}`)}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                      <span className="uppercase font-medium">{c.language}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs border ${sc.className}`}>
                    {sc.label}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this campaign?")) deleteMutation.mutate({ orgId: orgId!, campaignId: c.id });
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Multi-step Create Wizard ─────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setStep(0); setForm(DEFAULT_FORM); } }}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/60 max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>New Phishing Campaign</DialogTitle>
            {/* Step indicators */}
            <div className="flex items-center gap-2 pt-3">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${i === step ? "text-primary" : i < step ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {i < step
                      ? <CheckCircle2 className="w-4 h-4" />
                      : i === step
                        ? <div className="w-4 h-4 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-primary" /></div>
                        : <Circle className="w-4 h-4" />
                    }
                    {label}
                  </div>
                  {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < step ? "bg-emerald-400/50" : "bg-border"}`} />}
                </div>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 min-h-0">
            {/* ── Step 0: Basics ── */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Campaign Name *</Label>
                  <Input
                    placeholder="e.g. Q2 Finance Department Test"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="bg-background border-border/60"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Language</Label>
                  <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                    <SelectTrigger className="bg-background border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish (Español)</SelectItem>
                      <SelectItem value="tr">Turkish (Türkçe)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sender Name</Label>
                    <Input
                      placeholder="IT Security Team"
                      value={form.senderName}
                      onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))}
                      className="bg-background border-border/60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sender Email</Label>
                    <Input
                      placeholder="security@company.com"
                      value={form.senderEmail}
                      onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))}
                      className="bg-background border-border/60"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Template ── */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={form.templateSearch}
                    onChange={e => setForm(f => ({ ...f, templateSearch: e.target.value }))}
                    className="pl-9 h-8 text-sm bg-background border-border/60"
                  />
                </div>
                {/* Skip option */}
                <div
                  onClick={() => setForm(f => ({ ...f, templateId: null }))}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.templateId === null ? "border-primary bg-primary/5" : "border-border/60 hover:border-border"}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${form.templateId === null ? "border-primary" : "border-muted-foreground/40"}`}>
                    {form.templateId === null && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium">No template (custom)</div>
                    <div className="text-xs text-muted-foreground">Configure email content manually after creation</div>
                  </div>
                </div>
                {filteredTemplates.length === 0 && form.templateSearch ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No templates match your search.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {filteredTemplates.map(t => (
                      <div
                        key={t.id}
                        onClick={() => setForm(f => ({ ...f, templateId: t.id }))}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.templateId === t.id ? "border-primary bg-primary/5" : "border-border/60 hover:border-border"}`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${form.templateId === t.id ? "border-primary" : "border-muted-foreground/40"}`}>
                          {form.templateId === t.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{t.name}</span>
                            <Badge variant="outline" className={`text-xs border capitalize ${DIFFICULTY_COLORS[t.difficulty] ?? ""}`}>{t.difficulty}</Badge>
                            <Badge variant="outline" className="text-xs border border-border/60 text-muted-foreground">{ATTACK_LABELS[t.attackType] ?? t.attackType}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</div>
                          {t.brandName && <div className="text-xs text-muted-foreground/60 mt-0.5">{t.brandName}</div>}
                        </div>
                        <FileText className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Targets ── */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Select targets for this campaign. You can also add targets later.
                  </p>
                  {form.selectedTargetIds.length > 0 && (
                    <Badge variant="outline" className="text-xs border border-primary/40 text-primary bg-primary/5">
                      {form.selectedTargetIds.length} selected
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search targets..."
                    value={form.targetSearch}
                    onChange={e => setForm(f => ({ ...f, targetSearch: e.target.value }))}
                    className="pl-9 h-8 text-sm bg-background border-border/60"
                  />
                </div>
                {targets.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                    No targets yet. You can add targets in the Targets section and assign them later.
                  </div>
                ) : filteredTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No targets match your search.</p>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {/* Select all */}
                    <div
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-secondary/30 cursor-pointer hover:bg-secondary/50"
                      onClick={() => {
                        const allIds = filteredTargets.map(t => t.id);
                        const allSelected = allIds.every(id => form.selectedTargetIds.includes(id));
                        setForm(f => ({
                          ...f,
                          selectedTargetIds: allSelected
                            ? f.selectedTargetIds.filter(id => !allIds.includes(id))
                            : Array.from(new Set([...f.selectedTargetIds, ...allIds])),
                        }));
                      }}
                    >
                      <Checkbox
                        checked={filteredTargets.length > 0 && filteredTargets.every(t => form.selectedTargetIds.includes(t.id))}
                        className="pointer-events-none"
                      />
                      <span className="text-xs font-medium text-muted-foreground">Select all ({filteredTargets.length})</span>
                    </div>
                    {filteredTargets.map(t => (
                      <div
                        key={t.id}
                        onClick={() => toggleTarget(t.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${form.selectedTargetIds.includes(t.id) ? "border-primary/40 bg-primary/5" : "border-border/60 hover:border-border"}`}
                      >
                        <Checkbox
                          checked={form.selectedTargetIds.includes(t.id)}
                          className="pointer-events-none"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{t.firstName} {t.lastName}</div>
                          <div className="text-xs text-muted-foreground">{t.email}</div>
                        </div>
                        {t.title && <span className="text-xs text-muted-foreground/60 truncate max-w-24">{t.title}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-border/50 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => step === 0 ? (setShowCreate(false), setForm(DEFAULT_FORM)) : setStep(s => s - 1)}
            >
              {step === 0 ? "Cancel" : <><ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Back</>}
            </Button>
            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-primary" : i < step ? "bg-emerald-400" : "bg-border"}`} />
              ))}
            </div>
            {step < STEPS.length - 1 ? (
              <Button
                size="sm"
                disabled={step === 0 && !canProceedStep0}
                onClick={() => setStep(s => s + 1)}
              >
                Next
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={createMutation.isPending}
                onClick={handleCreate}
              >
                {createMutation.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
