import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Sparkles, BookTemplate, Globe, Copy, Eye, Trash2, Share2 } from "lucide-react";

const attackTypeLabels: Record<string, string> = {
  credential_harvest: "Credential Harvest",
  link_click: "Link Click",
  attachment: "Attachment",
  vishing: "Vishing",
  smishing: "Smishing",
  pretexting: "Pretexting",
};

const difficultyColors: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  hard: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function Templates() {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("library");
  const [showCreate, setShowCreate] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; htmlBody: string } | null>(null);

  const [aiForm, setAiForm] = useState({
    industry: "technology",
    attackType: "credential_harvest",
    language: "en",
    difficulty: "medium",
    context: "",
  });

  const [createForm, setCreateForm] = useState({
    name: "", subject: "", htmlBody: "", language: "en",
    attackType: "credential_harvest", difficulty: "medium", isShared: false, tags: "",
  });

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const orgId = orgsData?.[0]?.org?.id;

  const { data: templates, refetch } = trpc.templates.list.useQuery(
    { orgId: orgId!, includeCommunity: tab === "community" },
    { enabled: !!orgId }
  );

  const generateMutation = trpc.templates.generate.useMutation({
    onSuccess: (data) => {
      setCreateForm(f => ({ ...f, name: data.name, subject: data.subject, htmlBody: data.htmlBody, tags: data.tags.join(", ") }));
      setShowAI(false);
      setShowCreate(true);
      toast.success("AI template generated! Review and save it.");
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.templates.create.useMutation({
    onSuccess: () => { toast.success("Template saved!"); setShowCreate(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const forkMutation = trpc.templates.forkToOrg.useMutation({
    onSuccess: () => { toast.success("Template copied to your library!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => { toast.success("Template deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (templates ?? []).filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout
      title="Templates"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAI(true)}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-violet-400" />
            AI Generate
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Template
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between gap-4">
            <TabsList className="bg-card border border-border/60 h-8">
              <TabsTrigger value="library" className="text-xs h-6 px-3">My Library</TabsTrigger>
              <TabsTrigger value="community" className="text-xs h-6 px-3">Community</TabsTrigger>
            </TabsList>
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search templates..." className="pl-8 h-8 text-xs bg-card border-border/60" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <TabsContent value="library" className="mt-4">
            {filtered.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-16 text-center">
                  <BookTemplate className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No templates yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your first template or use AI to generate one.</p>
                  <div className="flex items-center gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={() => setShowAI(true)}>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Generate
                    </Button>
                    <Button size="sm" onClick={() => setShowCreate(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Manually
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onPreview={() => setPreview({ subject: t.subject, htmlBody: t.htmlBody })}
                    onDelete={() => { if (confirm("Delete template?")) deleteMutation.mutate({ orgId: orgId!, templateId: t.id }); }}
                    showDelete
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="community" className="mt-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPreview={() => setPreview({ subject: t.subject, htmlBody: t.htmlBody })}
                  onFork={() => forkMutation.mutate({ orgId: orgId!, templateId: t.id })}
                  showFork
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Generate dialog */}
      <Dialog open={showAI} onOpenChange={setShowAI}>
        <DialogContent className="sm:max-w-lg bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              AI Template Generator
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Industry</Label>
                <Select value={aiForm.industry} onValueChange={v => setAiForm(f => ({ ...f, industry: v }))}>
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["technology", "finance", "healthcare", "retail", "manufacturing", "government", "education", "legal"].map(i => (
                      <SelectItem key={i} value={i} className="capitalize">{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Attack Type</Label>
                <Select value={aiForm.attackType} onValueChange={v => setAiForm(f => ({ ...f, attackType: v }))}>
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(attackTypeLabels).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Language</Label>
                <Select value={aiForm.language} onValueChange={v => setAiForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="tr">Turkish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Difficulty</Label>
                <Select value={aiForm.difficulty} onValueChange={v => setAiForm(f => ({ ...f, difficulty: v }))}>
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Additional Context (optional)</Label>
              <Textarea
                placeholder="e.g. Pretend to be the IT department asking for password reset..."
                className="bg-background border-border/60 text-xs resize-none h-20"
                value={aiForm.context}
                onChange={e => setAiForm(f => ({ ...f, context: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAI(false)}>Cancel</Button>
            <Button
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate({
                orgId: orgId!,
                industry: aiForm.industry,
                attackType: aiForm.attackType as any,
                language: aiForm.language as any,
                difficulty: aiForm.difficulty as any,
                context: aiForm.context || undefined,
              })}
            >
              {generateMutation.isPending ? (
                <><span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin mr-2" />Generating...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate Template</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-5xl bg-card border-border/60 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Template Name</Label>
                <Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="bg-background border-border/60" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Email Subject</Label>
                <Input value={createForm.subject} onChange={e => setCreateForm(f => ({ ...f, subject: e.target.value }))} className="bg-background border-border/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Language</Label>
                <Select value={createForm.language} onValueChange={v => setCreateForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger className="bg-background border-border/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="tr">Turkish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Difficulty</Label>
                <Select value={createForm.difficulty} onValueChange={v => setCreateForm(f => ({ ...f, difficulty: v }))}>
                  <SelectTrigger className="bg-background border-border/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Email Body (HTML)</Label>
                  <span className="text-xs text-muted-foreground">Live preview updates as you type</span>
                </div>
                <div className="grid grid-cols-2 gap-3 h-64">
                  <Textarea
                    value={createForm.htmlBody}
                    onChange={e => setCreateForm(f => ({ ...f, htmlBody: e.target.value }))}
                    className="bg-background border-border/60 font-mono text-xs resize-none h-full"
                    placeholder="Paste HTML from a real email or write your own..."
                  />
                  <div className="border border-border/60 rounded-lg overflow-hidden bg-white h-full">
                    <div className="bg-secondary/50 px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
                      <Eye className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Live Preview</span>
                    </div>
                    <iframe
                      srcDoc={createForm.htmlBody || "<p style='font-family:sans-serif;color:#999;padding:16px;font-size:13px'>Start typing HTML to see a live preview...</p>"}
                      className="w-full border-0"
                      style={{ height: 'calc(100% - 32px)' }}
                      sandbox="allow-same-origin"
                      title="Email Preview"
                    />
                  </div>
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Tags (comma separated)</Label>
                <Input value={createForm.tags} onChange={e => setCreateForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. finance, urgent, password" className="bg-background border-border/60" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!createForm.name || !createForm.subject || createMutation.isPending}
              onClick={() => createMutation.mutate({
                orgId: orgId!,
                name: createForm.name,
                subject: createForm.subject,
                htmlBody: createForm.htmlBody,
                language: createForm.language as any,
                attackType: createForm.attackType as any,
                difficulty: createForm.difficulty as any,
                isShared: createForm.isShared,
                tags: createForm.tags.split(",").map(t => t.trim()).filter(Boolean),
              })}
            >
              {createMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/60 max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">Preview: {preview?.subject}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] rounded-lg bg-white p-4">
            {preview && (
              <div className="border border-border/60 rounded-lg overflow-hidden bg-white h-96">
                <iframe
                  srcDoc={preview.htmlBody}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email Preview"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function TemplateCard({ template, onPreview, onDelete, onFork, showDelete, showFork }: any) {
  return (
    <Card className="border-border/60 hover:border-primary/30 transition-all group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{template.name}</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{template.subject}</div>
          </div>
          <Badge variant="outline" className={`text-xs border flex-shrink-0 ${difficultyColors[template.difficulty] ?? ""}`}>
            {template.difficulty}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Badge variant="secondary" className="text-xs h-5 px-1.5">
            {attackTypeLabels[template.attackType] ?? template.attackType}
          </Badge>
          <Badge variant="secondary" className="text-xs h-5 px-1.5 uppercase">
            {template.language}
          </Badge>
          {template.isShared && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-violet-500/10 text-violet-400">
              <Share2 className="w-2.5 h-2.5 mr-1" />Shared
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onPreview}>
            <Eye className="w-3 h-3 mr-1" />Preview
          </Button>
          {showFork && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onFork}>
              <Copy className="w-3 h-3 mr-1" />Use
            </Button>
          )}
          {showDelete && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
