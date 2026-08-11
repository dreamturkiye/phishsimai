import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plug, CheckCircle2, AlertTriangle, Trash2, Ticket } from "lucide-react";

/**
 * PS-PSA-01 — the MSP admin surface for PSA ticketing. ConnectWise Manage and Halo PSA are both
 * generally available for self-serve configuration here. The honesty rule holds in the UI: we render
 * "Connected" ONLY when a real test succeeded (lastTestOk === true), show the last error verbatim
 * otherwise, and never invent a ticket count — ticketsCreated is the real running total from the
 * server. A connection stays disabled until the MSP adds credentials, maps the client org, and
 * enables it — we never default a connection to enabled.
 */
type Customer = { customer: { orgId: number }; org: { id: number; name: string } | null };

export default function PsaIntegrations({ customers }: { customers: Customer[] }) {
  const { data, isLoading, refetch } = trpc.psa.getConnections.useQuery();
  const cw = data?.connections.find((c) => c.provider === "connectwise_manage");
  const halo = data?.connections.find((c) => c.provider === "halo");

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Ticket className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">PSA ticketing — ConnectWise Manage &amp; Halo</h3>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Connect PhishSim to <strong>ConnectWise Manage</strong> or <strong>Halo PSA</strong>. When a user reports a
          <strong> real</strong> suspicious email, PhishSim can open a service-desk ticket with the details your team
          needs. <strong>Simulation reports are scored only and never create tickets</strong>, so training noise stays
          out of your queue.
        </p>
        <div className="mt-2.5 text-[12px] text-muted-foreground">
          To turn it on for a client: <strong className="text-foreground">1.</strong> add and test the connection ·
          <strong className="text-foreground"> 2.</strong> map each client org to a PSA company ·
          <strong className="text-foreground"> 3.</strong> enable the connection. Tickets flow only once all three are done.
        </div>
      </div>

      {!data?.secretKeyConfigured && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-600/10 p-3 text-[13px] text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>PSA_SECRET_KEY is not set.</strong> The server will refuse to store PSA credentials in the clear —
            set a strong <code>PSA_SECRET_KEY</code> in the environment before connecting a PSA.
          </span>
        </div>
      )}

      <ConnectwiseCard conn={cw} customers={customers} onChanged={refetch} disabled={!data?.secretKeyConfigured} />
      <HaloCard conn={halo} customers={customers} onChanged={refetch} disabled={!data?.secretKeyConfigured} />
    </div>
  );
}

function StatusBadge({ conn }: { conn: any }) {
  if (!conn) return <Badge variant="secondary">Not configured</Badge>;
  if (conn.lastTestOk === true)
    return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">Connected</Badge>;
  if (conn.lastTestOk === false)
    return <Badge className="bg-red-600/20 text-red-400 border-red-600/30">Test failed</Badge>;
  return <Badge variant="secondary">Untested</Badge>;
}

function ConnectwiseCard({ conn, customers, onChanged, disabled }: { conn: any; customers: Customer[]; onChanged: () => void; disabled: boolean }) {
  const cfg = (conn?.config ?? {}) as any;
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl ?? "");
  const [companyId, setCompanyId] = useState(cfg.companyId ?? "");
  const [serviceBoardId, setServiceBoardId] = useState(cfg.serviceBoardId != null ? String(cfg.serviceBoardId) : "");
  const [priorityId, setPriorityId] = useState(cfg.priorityId != null ? String(cfg.priorityId) : "");
  const [ticketType, setTicketType] = useState(cfg.ticketType ?? "");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [enabled, setEnabled] = useState(!!conn?.enabled);

  const buildConfig = () => ({
    baseUrl: baseUrl.trim(),
    companyId: companyId.trim(),
    serviceBoardId: Number(serviceBoardId),
    ...(priorityId ? { priorityId: Number(priorityId) } : {}),
    ...(ticketType.trim() ? { ticketType: ticketType.trim() } : {}),
  });
  // Only send credentials when the admin actually typed them (so editing config keeps stored keys).
  const buildSecret = () =>
    publicKey || privateKey || clientId ? { publicKey, privateKey, clientId } : undefined;

  const upsert = trpc.psa.upsertConnection.useMutation({
    onSuccess: () => { toast.success("ConnectWise connection saved"); setPublicKey(""); setPrivateKey(""); setClientId(""); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const test = trpc.psa.testConnection.useMutation({
    onSuccess: (r) => { r.ok ? toast.success(r.detail ?? "Connected") : toast.error(r.detail ?? "Test failed"); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="w-4 h-4 text-primary" /> ConnectWise Manage — Service Desk
          <span className="ml-auto flex items-center gap-2">
            {conn?.ticketsCreated > 0 && (
              <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5" /> {conn.ticketsCreated} tickets
              </span>
            )}
            <StatusBadge conn={conn} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {conn?.lastError && conn?.lastTestOk !== true && (
          <p className="text-[12px] text-red-400/90 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {conn.lastError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="API base URL"><Input placeholder="https://api-na.myconnectwise.net" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
          <Field label="CW Company ID"><Input placeholder="your-cw-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} /></Field>
          <Field label="Service Board ID"><Input placeholder="12" value={serviceBoardId} onChange={(e) => setServiceBoardId(e.target.value)} /></Field>
          <Field label="Priority ID (optional)"><Input placeholder="3" value={priorityId} onChange={(e) => setPriorityId(e.target.value)} /></Field>
          <Field label="Ticket Type (optional)"><Input placeholder="Phishing" value={ticketType} onChange={(e) => setTicketType(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Public Key"><Input type="password" placeholder={conn?.hasCredentials ? "•••• stored" : ""} value={publicKey} onChange={(e) => setPublicKey(e.target.value)} /></Field>
          <Field label="Private Key"><Input type="password" placeholder={conn?.hasCredentials ? "•••• stored" : ""} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} /></Field>
          <Field label="Client ID"><Input type="password" placeholder={conn?.hasCredentials ? "•••• stored" : ""} value={clientId} onChange={(e) => setClientId(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Service Desk ticketing for non-simulation reports
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled || upsert.isPending}
            onClick={() => upsert.mutate({ provider: "connectwise_manage", enabled, config: buildConfig(), secret: buildSecret() })}>
            Save
          </Button>
          <Button size="sm" variant="outline" disabled={test.isPending}
            onClick={() => test.mutate({ provider: "connectwise_manage", config: buildConfig(), secret: buildSecret() })}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Test connection
          </Button>
        </div>

        {conn?.hasCredentials && <MappingTable connectionId={conn.id} customers={customers} onChanged={onChanged} />}
      </CardContent>
    </Card>
  );
}

function HaloCard({ conn, customers, onChanged, disabled }: { conn: any; customers: Customer[]; onChanged: () => void; disabled: boolean }) {
  const cfg = (conn?.config ?? {}) as any;
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl ?? "");
  const [ticketTypeId, setTicketTypeId] = useState(cfg.ticketTypeId != null ? String(cfg.ticketTypeId) : "");
  const [teamId, setTeamId] = useState(cfg.teamId != null ? String(cfg.teamId) : "");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [enabled, setEnabled] = useState(!!conn?.enabled);

  const buildConfig = () => ({
    baseUrl: baseUrl.trim(),
    ...(ticketTypeId ? { ticketTypeId: Number(ticketTypeId) } : {}),
    ...(teamId ? { teamId: Number(teamId) } : {}),
  });
  const buildSecret = () => (clientId || clientSecret ? { clientId, clientSecret } : undefined);

  const upsert = trpc.psa.upsertConnection.useMutation({
    onSuccess: () => { toast.success("Halo connection saved"); setClientId(""); setClientSecret(""); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const test = trpc.psa.testConnection.useMutation({
    onSuccess: (r) => { r.ok ? toast.success(r.detail ?? "Connected") : toast.error(r.detail ?? "Test failed"); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="w-4 h-4 text-primary" /> Halo PSA
          <span className="ml-auto flex items-center gap-2">
            {conn?.ticketsCreated > 0 && (
              <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5" /> {conn.ticketsCreated} tickets
              </span>
            )}
            <StatusBadge conn={conn} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-[12px] text-muted-foreground">Cloud Halo tenants only. On-prem Halo is not supported.</p>
        {conn?.lastError && conn?.lastTestOk !== true && (
          <p className="text-[12px] text-red-400/90 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {conn.lastError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Halo base URL"><Input placeholder="https://your-tenant.halopsa.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
          <Field label="Ticket Type ID (optional)"><Input placeholder="21" value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)} /></Field>
          <Field label="Team ID (optional)"><Input placeholder="4" value={teamId} onChange={(e) => setTeamId(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client ID"><Input type="password" placeholder={conn?.hasCredentials ? "•••• stored" : ""} value={clientId} onChange={(e) => setClientId(e.target.value)} /></Field>
          <Field label="Client Secret"><Input type="password" placeholder={conn?.hasCredentials ? "•••• stored" : ""} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Halo ticketing for non-simulation reports
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled || upsert.isPending}
            onClick={() => upsert.mutate({ provider: "halo", enabled, config: buildConfig(), secret: buildSecret() })}>
            Save
          </Button>
          <Button size="sm" variant="outline" disabled={test.isPending}
            onClick={() => test.mutate({ provider: "halo", config: buildConfig(), secret: buildSecret() })}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Test connection
          </Button>
        </div>
        {conn?.hasCredentials && <MappingTable connectionId={conn.id} provider="halo" customers={customers} onChanged={onChanged} />}
      </CardContent>
    </Card>
  );
}

function MappingTable({ connectionId, provider = "connectwise_manage", customers, onChanged }: { connectionId: number; provider?: "connectwise_manage" | "halo"; customers: Customer[]; onChanged: () => void }) {
  const { data: mappings = [], refetch } = trpc.psa.getMappings.useQuery();
  const companies = trpc.psa.listExternalCompanies.useMutation();
  const [orgId, setOrgId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");

  const list = (companies.data ?? []) as Array<{ id: string; name: string }>;
  // Each provider card owns its own mappings — filter by this connection so the two cards never
  // show each other's rows.
  const rows = (mappings as any[]).filter((m) => m.connectionId === connectionId);
  const label = provider === "halo" ? "Halo client" : "ConnectWise company";
  const upsert = trpc.psa.upsertMapping.useMutation({
    onSuccess: () => { toast.success("Mapping saved"); setOrgId(""); setCompanyId(""); refetch(); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.psa.deleteMapping.useMutation({ onSuccess: () => { refetch(); onChanged(); }, onError: (e) => toast.error(e.message) });

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">Company mapping (PhishSim org ↔ {label})</div>
      <p className="text-[12px] text-muted-foreground">A client's reports create tickets only after its org is mapped to a {label}.</p>

      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 text-[13px]">
              <span className="flex-1 truncate">{customers.find((c) => c.org?.id === m.orgId)?.org?.name ?? `Org #${m.orgId}`}</span>
              <span className="text-muted-foreground">→</span>
              <span className="flex-1 truncate">{m.externalCompanyName ?? m.externalCompanyId}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => del.mutate({ mappingId: m.id })}>
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px]">
          <Label className="text-[11px] text-muted-foreground">PhishSim customer</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Select org" /></SelectTrigger>
            <SelectContent>
              {customers.filter((c) => c.org).map((c) => (
                <SelectItem key={c.org!.id} value={String(c.org!.id)}>{c.org!.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-[11px] text-muted-foreground">{label}</Label>
          <Select value={companyId} onValueChange={setCompanyId} disabled={!list.length}>
            <SelectTrigger className="h-8"><SelectValue placeholder={list.length ? "Select company" : "Load companies →"} /></SelectTrigger>
            <SelectContent>
              {list.map((co) => <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" disabled={companies.isPending}
          onClick={() => companies.mutate({ provider })}>
          {companies.isPending ? "Loading…" : "Load companies"}
        </Button>
        <Button size="sm" disabled={!orgId || !companyId || upsert.isPending}
          onClick={() => upsert.mutate({ connectionId, orgId: Number(orgId), externalCompanyId: companyId, externalCompanyName: list.find((c) => c.id === companyId)?.name })}>
          Add mapping
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
