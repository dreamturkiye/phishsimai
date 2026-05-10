import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Mail, Search, Calendar, Users, ChevronRight, Trash2, Play, Pause } from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed: { label: "Completed", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  paused: { label: "Paused", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export default function Campaigns() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", language: "en", senderName: "", senderEmail: "" });

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const orgId = orgsData?.[0]?.org?.id;

  const { data: campaigns, refetch } = trpc.campaigns.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: templates } = trpc.templates.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: (data) => {
      toast.success("Campaign created!");
      setShowCreate(false);
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

  return (
    <AppLayout
      title="Campaigns"
      actions={
        <Button size="sm" onClick={() => setShowCreate(true)}>
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
              <Button onClick={() => setShowCreate(true)}>
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

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader>
            <DialogTitle>New Phishing Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Campaign Name</Label>
              <Input
                placeholder="e.g. Q2 Finance Department Test"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="bg-background border-border/60"
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!form.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({
                orgId: orgId!,
                name: form.name,
                language: form.language as "en" | "es" | "tr",
                senderName: form.senderName || undefined,
                senderEmail: form.senderEmail || undefined,
              })}
            >
              {createMutation.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
