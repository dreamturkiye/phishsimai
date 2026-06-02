import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Sparkles, Eye, Trash2, Copy, X, Filter,
  ChevronDown, ChevronRight, LayoutGrid, List, Tag, Building2,
  Zap, Shield, Mail, Phone, MessageSquare, AlertTriangle, Globe,
  CheckCircle2, Clock
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const ATTACK_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  credential_harvest: {
    label: "Credential Harvest",
    icon: <Shield className="w-3 h-3" />,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
  link_click: {
    label: "Link Click",
    icon: <Zap className="w-3 h-3" />,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  attachment: {
    label: "Attachment",
    icon: <Mail className="w-3 h-3" />,
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  vishing: {
    label: "Vishing",
    icon: <Phone className="w-3 h-3" />,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
  smishing: {
    label: "Smishing",
    icon: <MessageSquare className="w-3 h-3" />,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  pretexting: {
    label: "Pretexting",
    icon: <AlertTriangle className="w-3 h-3" />,
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
  },
};

const DIFFICULTY_META: Record<string, { label: string; color: string; dot: string }> = {
  easy: { label: "Easy", color: "text-emerald-400", dot: "bg-emerald-400" },
  medium: { label: "Medium", color: "text-amber-400", dot: "bg-amber-400" },
  hard: { label: "Hard", color: "text-red-400", dot: "bg-red-400" },
};

const INDUSTRIES = [
  "All Industries", "Technology", "Finance", "Healthcare", "Retail",
  "Government", "Education", "Legal", "Logistics", "Insurance",
  "Real Estate", "Energy", "Hospitality", "Travel", "Entertainment",
  "Telecommunications", "Sales", "Creative",
];

// Brand color map for template name prefix detection
const BRAND_COLORS: Record<string, { bg: string; text: string; abbr: string }> = {
  microsoft: { bg: "bg-[#00a4ef]/15", text: "text-[#00a4ef]", abbr: "MS" },
  google: { bg: "bg-[#4285f4]/15", text: "text-[#4285f4]", abbr: "G" },
  amazon: { bg: "bg-[#ff9900]/15", text: "text-[#ff9900]", abbr: "AMZ" },
  aws: { bg: "bg-[#ff9900]/15", text: "text-[#ff9900]", abbr: "AWS" },
  apple: { bg: "bg-[#555]/15", text: "text-slate-300", abbr: "APL" },
  paypal: { bg: "bg-[#003087]/15", text: "text-[#009cde]", abbr: "PP" },
  fedex: { bg: "bg-[#4d148c]/15", text: "text-[#ff6200]", abbr: "FDX" },
  ups: { bg: "bg-[#351c15]/15", text: "text-[#ffb500]", abbr: "UPS" },
  usps: { bg: "bg-[#004b87]/15", text: "text-[#004b87]", abbr: "USPS" },
  zoom: { bg: "bg-[#2d8cff]/15", text: "text-[#2d8cff]", abbr: "ZM" },
  docusign: { bg: "bg-[#ffb600]/15", text: "text-[#ffb600]", abbr: "DS" },
  dropbox: { bg: "bg-[#0061ff]/15", text: "text-[#0061ff]", abbr: "DBX" },
  linkedin: { bg: "bg-[#0a66c2]/15", text: "text-[#0a66c2]", abbr: "LI" },
  facebook: { bg: "bg-[#1877f2]/15", text: "text-[#1877f2]", abbr: "FB" },
  twitter: { bg: "bg-[#1da1f2]/15", text: "text-[#1da1f2]", abbr: "TW" },
  slack: { bg: "bg-[#4a154b]/15", text: "text-[#e01e5a]", abbr: "SLK" },
  salesforce: { bg: "bg-[#00a1e0]/15", text: "text-[#00a1e0]", abbr: "SF" },
  wellsfargo: { bg: "bg-[#d71e28]/15", text: "text-[#d71e28]", abbr: "WF" },
  "wells fargo": { bg: "bg-[#d71e28]/15", text: "text-[#d71e28]", abbr: "WF" },
  bankofamerica: { bg: "bg-[#012169]/15", text: "text-[#e31837]", abbr: "BOA" },
  "bank of america": { bg: "bg-[#012169]/15", text: "text-[#e31837]", abbr: "BOA" },
  chase: { bg: "bg-[#117aca]/15", text: "text-[#117aca]", abbr: "JPM" },
  irs: { bg: "bg-[#003366]/15", text: "text-[#003366]", abbr: "IRS" },
  hr: { bg: "bg-slate-500/15", text: "text-slate-300", abbr: "HR" },
  it: { bg: "bg-cyan-500/15", text: "text-cyan-400", abbr: "IT" },
};

function getBrandMeta(name: string) {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(BRAND_COLORS)) {
    if (lower.startsWith(key) || lower.includes(key)) return val;
  }
  // Fallback: first 2 chars of name
  return {
    bg: "bg-primary/10",
    text: "text-primary",
    abbr: name.slice(0, 2).toUpperCase(),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TemplateItem = {
  id: number;
  name: string;
  subject: string;
  htmlBody: string;
  attackType: string;
  difficulty: string;
  industry: string | null;
  language: string;
  tags: string[];
  isBuiltIn: boolean;
  isShared: boolean;
  usageCount: number;
  source: string;
};

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="flex items-center justify-between w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {title}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function FilterChip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs transition-all text-left ${
        active
          ? "bg-primary/15 text-primary font-medium border border-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={`ml-1 text-[10px] flex-shrink-0 ${active ? "text-primary/70" : "text-muted-foreground/60"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Template Card ───────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onPreview,
  onDelete,
  onFork,
  showDelete,
  showFork,
}: {
  template: TemplateItem;
  onPreview: () => void;
  onDelete?: () => void;
  onFork?: () => void;
  showDelete?: boolean;
  showFork?: boolean;
}) {
  const brand = getBrandMeta(template.name);
  const attackMeta = ATTACK_TYPE_META[template.attackType];
  const diffMeta = DIFFICULTY_META[template.difficulty];
  const tags = Array.isArray(template.tags) ? template.tags : [];

  return (
    <Card
      className="border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group cursor-pointer overflow-hidden"
      onClick={onPreview}
    >
      <CardContent className="p-0">
        {/* Header strip with brand color */}
        <div className={`px-4 py-3 ${brand.bg} border-b border-border/40`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${brand.bg} ${brand.text} border border-current/20`}>
              {brand.abbr}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight truncate text-foreground">{template.name}</div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">{template.subject}</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Attack type + difficulty row */}
          <div className="flex items-center gap-2 flex-wrap">
            {attackMeta && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${attackMeta.bg} ${attackMeta.color}`}>
                {attackMeta.icon}
                {attackMeta.label}
              </span>
            )}
            {diffMeta && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${diffMeta.dot}`} />
                <span className={diffMeta.color}>{diffMeta.label}</span>
              </span>
            )}
            {template.language !== "en" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-border/50 text-muted-foreground">
                <Globe className="w-2.5 h-2.5" />
                {template.language.toUpperCase()}
              </span>
            )}
          </div>

          {/* Industry + tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {template.industry && template.industry !== "All Industries" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-muted/50 text-muted-foreground border border-border/40">
                <Building2 className="w-2.5 h-2.5" />
                {template.industry}
              </span>
            )}
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-muted/30 text-muted-foreground/70">
                #{tag}
              </span>
            ))}
          </div>

          {/* Footer: source + actions */}
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              {template.isBuiltIn && (
                <span className="inline-flex items-center gap-1 text-[10px] text-cyan-400/80">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Built-in
                </span>
              )}
              {template.usageCount > 0 && (
                <span className="text-[10px] text-muted-foreground/60">
                  · {template.usageCount.toLocaleString()} uses
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] hover:bg-primary/10 hover:text-primary" onClick={onPreview}>
                <Eye className="w-3 h-3 mr-1" />Preview
              </Button>
              {showFork && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] hover:bg-emerald-500/10 hover:text-emerald-400" onClick={onFork}>
                  <Copy className="w-3 h-3 mr-1" />Use
                </Button>
              )}
              {showDelete && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton Card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card className="border-border/40 overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 py-3 bg-muted/20 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-muted/40 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-muted/40 rounded animate-pulse w-3/4" />
              <div className="h-2.5 bg-muted/30 rounded animate-pulse w-full" />
            </div>
          </div>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-28 bg-muted/30 rounded-full animate-pulse" />
            <div className="h-5 w-14 bg-muted/20 rounded-full animate-pulse" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-4 w-20 bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted/15 rounded animate-pulse" />
          </div>
          <div className="h-px bg-border/30" />
          <div className="h-3 w-16 bg-muted/20 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Preview Modal ───────────────────────────────────────────────────────────

function PreviewModal({
  template,
  onClose,
  onFork,
  onDelete,
  showFork,
  showDelete,
}: {
  template: TemplateItem | null;
  onClose: () => void;
  onFork?: () => void;
  onDelete?: () => void;
  showFork?: boolean;
  showDelete?: boolean;
}) {
  if (!template) return null;
  const brand = getBrandMeta(template.name);
  const attackMeta = ATTACK_TYPE_META[template.attackType];
  const diffMeta = DIFFICULTY_META[template.difficulty];
  const tags = Array.isArray(template.tags) ? template.tags : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ animation: 'fadeIn 0.15s ease' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border/50 bg-card flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${brand.bg} ${brand.text} border border-current/20`}>
            {brand.abbr}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm leading-tight truncate">{template.name}</h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">Subject: {template.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showFork && (
            <Button size="sm" onClick={() => { onFork?.(); onClose(); }}>
              <Copy className="w-3.5 h-3.5 mr-1.5" />Use This Template
            </Button>
          )}
          {showDelete && (
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { onDelete?.(); onClose(); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
            </Button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: preview + metadata */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Email preview */}
        <div className="flex-1 bg-white overflow-hidden">
          <iframe
            srcDoc={template.htmlBody}
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
            title="Email Preview"
          />
        </div>

        {/* Metadata sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-border/50 bg-card flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Template Details</p>
          </div>
          <ScrollArea className="flex-1 px-5 py-4">
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Attack Type</p>
                {attackMeta && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${attackMeta.bg} ${attackMeta.color}`}>
                    {attackMeta.icon}
                    {attackMeta.label}
                  </span>
                )}
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Difficulty</p>
                {diffMeta && (
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span className={`w-2 h-2 rounded-full ${diffMeta.dot}`} />
                    <span className={diffMeta.color}>{diffMeta.label}</span>
                  </span>
                )}
              </div>

              {template.industry && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Industry</p>
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    {template.industry}
                  </span>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Language</p>
                <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  {template.language === "en" ? "English" : template.language === "es" ? "Spanish" : "Turkish"}
                </span>
              </div>

              {template.isBuiltIn && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Source</p>
                  <span className="inline-flex items-center gap-1.5 text-xs text-cyan-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    PhishGuard Built-in
                  </span>
                </div>
              )}

              {tags.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-md text-[11px] bg-muted/50 text-muted-foreground border border-border/40">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {template.usageCount > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Usage</p>
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    {template.usageCount.toLocaleString()} campaigns
                  </span>
                </div>
              )}

              <div className="pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Email Subject Line</p>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                  <p className="text-xs text-foreground font-medium">{template.subject}</p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Templates() {
  const { isAuthenticated } = useAuth();

  // Filter state
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "built-in" | "mine" | "community">("all");
  const [filterAttackType, setFilterAttackType] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string | null>(null);
  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);
  const [filterLanguage, setFilterLanguage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);

  const [aiForm, setAiForm] = useState({
    industry: "technology", attackType: "credential_harvest",
    language: "en", difficulty: "medium", context: "",
  });
  const [createForm, setCreateForm] = useState({
    name: "", subject: "", htmlBody: "", language: "en",
    attackType: "credential_harvest", difficulty: "medium", isShared: false, tags: "",
  });

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const { orgId } = useActiveOrg();

  const { data: allTemplates, isLoading, refetch } = trpc.templates.list.useQuery(
    { orgId: orgId!, includeBuiltIn: true, includeCommunity: true },
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

  // Compute filtered templates
  const filtered = useMemo(() => {
    if (!allTemplates) return [];
    let list = allTemplates as TemplateItem[];

    // Tab filter
    if (activeTab === "built-in") list = list.filter(t => t.isBuiltIn);
    else if (activeTab === "mine") list = list.filter(t => !t.isBuiltIn && t.source === "org");
    else if (activeTab === "community") list = list.filter(t => !t.isBuiltIn && t.isShared);

    // Sidebar filters
    if (filterAttackType) list = list.filter(t => t.attackType === filterAttackType);
    if (filterDifficulty) list = list.filter(t => t.difficulty === filterDifficulty);
    if (filterIndustry) list = list.filter(t => t.industry === filterIndustry);
    if (filterLanguage) list = list.filter(t => t.language === filterLanguage);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (Array.isArray(t.tags) ? t.tags : []).some((tag: string) => tag.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allTemplates, activeTab, filterAttackType, filterDifficulty, filterIndustry, filterLanguage, search]);

  // Count helpers for filter chips
  const countByAttackType = useMemo(() => {
    if (!allTemplates) return {};
    return (allTemplates as TemplateItem[]).reduce((acc, t) => {
      acc[t.attackType] = (acc[t.attackType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [allTemplates]);

  const countByDifficulty = useMemo(() => {
    if (!allTemplates) return {};
    return (allTemplates as TemplateItem[]).reduce((acc, t) => {
      acc[t.difficulty] = (acc[t.difficulty] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [allTemplates]);

  const countByIndustry = useMemo(() => {
    if (!allTemplates) return {};
    return (allTemplates as TemplateItem[]).reduce((acc, t) => {
      const ind = t.industry || "All Industries";
      acc[ind] = (acc[ind] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [allTemplates]);

  const clearFilters = useCallback(() => {
    setFilterAttackType(null);
    setFilterDifficulty(null);
    setFilterIndustry(null);
    setFilterLanguage(null);
    setSearch("");
  }, []);

  const hasFilters = !!(filterAttackType || filterDifficulty || filterIndustry || filterLanguage || search);

  const tabCounts = useMemo(() => {
    if (!allTemplates) return { all: 0, "built-in": 0, mine: 0, community: 0 };
    const list = allTemplates as TemplateItem[];
    return {
      all: list.length,
      "built-in": list.filter(t => t.isBuiltIn).length,
      mine: list.filter(t => !t.isBuiltIn && t.source === "org").length,
      community: list.filter(t => !t.isBuiltIn && t.isShared).length,
    };
  }, [allTemplates]);

  return (
    <AppLayout
      title="Template Library"
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
      <div className="flex gap-5 h-full min-h-0">
        {/* ── Left Filter Panel ── */}
        <aside className="w-52 flex-shrink-0 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3 h-3" /> Filters
            </span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[10px] text-primary hover:underline">
                Clear all
              </button>
            )}
          </div>

          <Separator className="mb-3" />

          {/* Source tabs */}
          <FilterSection title="Source">
            <div className="space-y-0.5">
              {(["all", "built-in", "mine", "community"] as const).map(tab => (
                <FilterChip
                  key={tab}
                  label={tab === "all" ? "All Templates" : tab === "built-in" ? "Built-in" : tab === "mine" ? "My Templates" : "Community"}
                  active={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  count={tabCounts[tab]}
                />
              ))}
            </div>
          </FilterSection>

          <Separator />

          {/* Attack Type */}
          <FilterSection title="Attack Type">
            <div className="space-y-0.5">
              {Object.entries(ATTACK_TYPE_META).map(([key, meta]) => (
                <FilterChip
                  key={key}
                  label={meta.label}
                  active={filterAttackType === key}
                  onClick={() => setFilterAttackType(filterAttackType === key ? null : key)}
                  count={countByAttackType[key] || 0}
                />
              ))}
            </div>
          </FilterSection>

          <Separator />

          {/* Difficulty */}
          <FilterSection title="Difficulty">
            <div className="space-y-0.5">
              {Object.entries(DIFFICULTY_META).map(([key, meta]) => (
                <FilterChip
                  key={key}
                  label={meta.label}
                  active={filterDifficulty === key}
                  onClick={() => setFilterDifficulty(filterDifficulty === key ? null : key)}
                  count={countByDifficulty[key] || 0}
                />
              ))}
            </div>
          </FilterSection>

          <Separator />

          {/* Industry */}
          <FilterSection title="Industry" defaultOpen={false}>
            <div className="space-y-0.5">
              {INDUSTRIES.filter(i => countByIndustry[i] > 0).map(ind => (
                <FilterChip
                  key={ind}
                  label={ind}
                  active={filterIndustry === ind}
                  onClick={() => setFilterIndustry(filterIndustry === ind ? null : ind)}
                  count={countByIndustry[ind] || 0}
                />
              ))}
            </div>
          </FilterSection>

          <Separator />

          {/* Language */}
          <FilterSection title="Language" defaultOpen={false}>
            <div className="space-y-0.5">
              {[
                { key: "en", label: "English" },
                { key: "es", label: "Spanish" },
                { key: "tr", label: "Turkish" },
              ].map(({ key, label }) => (
                <FilterChip
                  key={key}
                  label={label}
                  active={filterLanguage === key}
                  onClick={() => setFilterLanguage(filterLanguage === key ? null : key)}
                />
              ))}
            </div>
          </FilterSection>
        </aside>

        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Search + view toggle bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, subject, or tag..."
                className="pl-9 h-9 bg-card border-border/60 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-muted-foreground mr-2">
                {filtered.length} template{filtered.length !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost" size="sm"
                className={`h-8 w-8 p-0 ${viewMode === "grid" ? "bg-muted/50 text-foreground" : "text-muted-foreground"}`}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="sm"
                className={`h-8 w-8 p-0 ${viewMode === "list" ? "bg-muted/50 text-foreground" : "text-muted-foreground"}`}
                onClick={() => setViewMode("list")}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Active:</span>
              {filterAttackType && (
                <button
                  onClick={() => setFilterAttackType(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                >
                  {ATTACK_TYPE_META[filterAttackType]?.label}
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filterDifficulty && (
                <button
                  onClick={() => setFilterDifficulty(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                >
                  {DIFFICULTY_META[filterDifficulty]?.label}
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filterIndustry && (
                <button
                  onClick={() => setFilterIndustry(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                >
                  {filterIndustry}
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filterLanguage && (
                <button
                  onClick={() => setFilterLanguage(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                >
                  {filterLanguage.toUpperCase()}
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                >
                  "{search}"
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )}

          {/* Template grid / list */}
          {isLoading ? (
            <div className={viewMode === "grid" ? "grid md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-3"}>
              {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                <Tag className="w-7 h-7 text-muted-foreground/40" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No templates found</h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                {hasFilters ? "Try adjusting your filters or search query." : "Create your first template or use AI to generate one."}
              </p>
              <div className="flex items-center gap-2">
                {hasFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="w-3.5 h-3.5 mr-1.5" />Clear Filters
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setShowAI(true)}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />AI Generate
                </Button>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Create Manually
                </Button>
              </div>
            </div>
          ) : (
            <div className={viewMode === "grid" ? "grid md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-3"}>
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t as TemplateItem}
                  onPreview={() => setPreviewTemplate(t as TemplateItem)}
                  onDelete={() => { if (confirm("Delete this template?")) deleteMutation.mutate({ orgId: orgId!, templateId: t.id }); }}
                  onFork={() => forkMutation.mutate({ orgId: orgId!, templateId: t.id })}
                  showDelete={!t.isBuiltIn && t.source === "org"}
                  showFork={t.isBuiltIn || t.source !== "org"}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Preview Modal ── */}
      <PreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onFork={() => { if (previewTemplate) forkMutation.mutate({ orgId: orgId!, templateId: previewTemplate.id }); }}
        onDelete={() => { if (previewTemplate && confirm("Delete this template?")) deleteMutation.mutate({ orgId: orgId!, templateId: previewTemplate.id }); }}
        showFork={!!(previewTemplate && (previewTemplate.isBuiltIn || previewTemplate.source !== "org"))}
        showDelete={!!(previewTemplate && !previewTemplate.isBuiltIn && previewTemplate.source === "org")}
      />

      {/* ── AI Generate Dialog ── */}
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
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ATTACK_TYPE_META).map(([v, m]) => (
                      <SelectItem key={v} value={v}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Language</Label>
                <Select value={aiForm.language} onValueChange={v => setAiForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="bg-background border-border/60 h-8 text-xs"><SelectValue /></SelectTrigger>
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
                orgId: orgId!, industry: aiForm.industry,
                attackType: aiForm.attackType as any, language: aiForm.language as any,
                difficulty: aiForm.difficulty as any, context: aiForm.context || undefined,
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

      {/* ── Create Template Dialog ── */}
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
                      style={{ height: "calc(100% - 32px)" }}
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
                orgId: orgId!, name: createForm.name, subject: createForm.subject,
                htmlBody: createForm.htmlBody, language: createForm.language as any,
                attackType: createForm.attackType as any, difficulty: createForm.difficulty as any,
                isShared: createForm.isShared, tags: createForm.tags.split(",").map(t => t.trim()).filter(Boolean),
              })}
            >
              {createMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
