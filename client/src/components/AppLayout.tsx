import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Shield, LayoutDashboard, Mail, BookTemplate, Users, BarChart3,
  Settings, LogOut, ChevronDown, ChevronRight, Trophy, BookOpen,
  Menu, Building2, ShieldCheck, Network, ArrowLeftRight, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import MiaWidget from "@/components/MiaWidget";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  children?: { label: string; href: string; icon: React.ElementType }[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Phishing", href: "/campaigns", icon: Mail,
    children: [
      { label: "Campaigns", href: "/campaigns", icon: Mail },
      { label: "Templates", href: "/templates", icon: BookTemplate },
      { label: "Targets", href: "/targets", icon: Users },
      { label: "Training", href: "/training", icon: BookOpen },
      { label: "Leaderboard", href: "/gamification", icon: Trophy },
    ],
  },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(() =>
    item.children?.some(c => location.startsWith(c.href)) || location.startsWith(item.href)
  );

  const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href) && !item.children);
  const isParentActive = item.children?.some(c => location.startsWith(c.href));

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            isParentActive
              ? "text-foreground bg-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {open && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-border/50 pl-3">
            {item.children.map(child => (
              <NavLink key={child.href} item={child} depth={1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => navigate(item.href)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
        isActive
          ? "text-foreground bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      <span>{item.label}</span>
      {item.badge && (
        <Badge variant="secondary" className="ml-auto text-xs py-0 px-1.5 h-4">
          {item.badge}
        </Badge>
      )}
    </button>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

export default function AppLayout({ children, title, actions }: AppLayoutProps) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // BUG-06 FIX: multi-org switcher
  const [activeOrgIdx, setActiveOrgIdx] = useState(0);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const orgs = orgsData ?? [];
  const currentOrg = orgs[activeOrgIdx]?.org ?? orgs[0]?.org;

  // BUG-18 FIX: MSP impersonation mode via localStorage
  const mspManagedOrg = (() => { try { return JSON.parse(localStorage.getItem("msp_managed_org") ?? "null"); } catch { return null; } })();

  // Check if user has an MSP tenant (for role-gated MSP nav item)
  const { data: mspTenant } = trpc.msp.getMyTenant.useQuery(undefined, { enabled: isAuthenticated });
  const isMsp = !!mspTenant;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (!loading && isAuthenticated && orgs.length === 0) {
    navigate("/setup");
    return null;
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 w-full">
          <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-7 w-auto flex-shrink-0" />
          <div className="min-w-0 flex-1">
            {currentOrg && (
              <div className="text-xs text-muted-foreground truncate max-w-[120px]">{currentOrg.name}</div>
            )}
          </div>
        </button>
        {/* BUG-06 FIX: Org switcher for multi-org users */}
        {orgs.length > 1 && (
          <div className="mt-2 relative">
            <button
              onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/50 hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1 text-left truncate">Switch Organization</span>
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            </button>
            {showOrgSwitcher && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border/60 rounded-lg shadow-lg z-50 overflow-hidden">
                {orgs.map((o, idx) => (
                  <button
                    key={o.org.id}
                    onClick={() => { setActiveOrgIdx(idx); setShowOrgSwitcher(false); navigate("/dashboard"); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/50 transition-colors ${
                      idx === activeOrgIdx ? "bg-primary/10 text-primary" : "text-foreground"
                    }`}
                  >
                    <Building2 className="w-3 h-3 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">{o.org.name}</span>
                    {idx === activeOrgIdx && <Badge variant="outline" className="text-xs h-4 px-1 border-primary/30 text-primary">Active</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <NavLink key={item.href} item={item} />
        ))}
        {/* MSP Portal — only visible to registered MSP partners */}
        {isMsp && (
          <div className="mt-2 pt-2 border-t border-sidebar-border/50">
            <NavLink item={{ label: "MSP Portal", href: "/msp", icon: Network, badge: "MSP" }} />
          </div>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{user?.name ?? "User"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => logout()}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* BUG-18 FIX: MSP impersonation banner */}
      {mspManagedOrg && (
        <div className="sticky top-0 z-50 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <Building2 className="w-4 h-4 flex-shrink-0" />
            <span>Managing customer: <strong>{mspManagedOrg.orgName}</strong></span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 h-7 text-xs"
            onClick={() => { localStorage.removeItem("msp_managed_org"); navigate("/msp"); }}
          >
            <ExternalLink className="w-3 h-3 mr-1.5" />
            Return to MSP Portal
          </Button>
        </div>
      )}
      <div className="flex flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-sidebar border-r border-sidebar-border flex-shrink-0 fixed left-0 top-0 bottom-0 z-30">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-sidebar border-r border-sidebar-border z-50">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 border-b border-border/50 bg-background/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden w-8 h-8"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </Button>
          {title && <h1 className="font-semibold text-base flex-1">{title}</h1>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 lg:p-6">
          {children}
        </div>
        {currentOrg && (
          <MiaWidget orgId={currentOrg.id} orgName={currentOrg.name} />
        )}
      </main>
      </div>
    </div>
  );
}
