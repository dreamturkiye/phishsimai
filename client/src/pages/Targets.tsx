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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Users, Building2, Trash2, UserCheck, UserX, Upload } from "lucide-react";

export default function Targets() {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("employees");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [empForm, setEmpForm] = useState({ firstName: "", lastName: "", email: "", title: "", departmentId: "" });
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const orgId = orgsData?.[0]?.org?.id;

  const { data: targets, refetch: refetchTargets } = trpc.targets.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });
  const { data: departments, refetch: refetchDepts } = trpc.departments.list.useQuery({ orgId: orgId! }, { enabled: !!orgId });

  const createTargetMutation = trpc.targets.create.useMutation({
    onSuccess: () => { toast.success("Employee added!"); setShowAddEmployee(false); refetchTargets(); setEmpForm({ firstName: "", lastName: "", email: "", title: "", departmentId: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const deleteTargetMutation = trpc.targets.delete.useMutation({
    onSuccess: () => { toast.success("Employee removed"); refetchTargets(); },
    onError: (e) => toast.error(e.message),
  });

  const createDeptMutation = trpc.departments.create.useMutation({
    onSuccess: () => { toast.success("Department created!"); setShowAddDept(false); refetchDepts(); setDeptForm({ name: "", description: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const deleteDeptMutation = trpc.departments.delete.useMutation({
    onSuccess: () => { toast.success("Department deleted"); refetchDepts(); },
    onError: (e) => toast.error(e.message),
  });

  const filteredTargets = (targets ?? []).filter(t =>
    `${t.firstName} ${t.lastName} ${t.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const deptMap = Object.fromEntries((departments ?? []).map(d => [d.id, d.name]));

  return (
    <AppLayout
      title="Targets"
      actions={
        tab === "employees" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => toast.info("CSV import coming soon")}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setShowAddEmployee(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Employee
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowAddDept(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Department
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between gap-4">
            <TabsList className="bg-card border border-border/60 h-8">
              <TabsTrigger value="employees" className="text-xs h-6 px-3">
                <Users className="w-3 h-3 mr-1.5" />
                Employees ({targets?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="departments" className="text-xs h-6 px-3">
                <Building2 className="w-3 h-3 mr-1.5" />
                Departments ({departments?.length ?? 0})
              </TabsTrigger>
            </TabsList>
            {tab === "employees" && (
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search employees..." className="pl-8 h-8 text-xs bg-card border-border/60" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            )}
          </div>

          <TabsContent value="employees" className="mt-4">
            {filteredTargets.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-16 text-center">
                  <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No employees yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Add employees to target in your phishing campaigns.</p>
                  <Button size="sm" onClick={() => setShowAddEmployee(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Employee
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-card/50">
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Name</th>
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Email</th>
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Department</th>
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Title</th>
                      <th className="text-center py-3 px-4 text-xs text-muted-foreground font-medium">Status</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTargets.map((t) => (
                      <tr key={t.id} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                        <td className="py-3 px-4 font-medium">{t.firstName} {t.lastName}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{t.email}</td>
                        <td className="py-3 px-4">
                          {t.departmentId ? (
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">{deptMap[t.departmentId] ?? "—"}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{t.title ?? "—"}</td>
                        <td className="py-3 px-4 text-center">
                          {t.isActive
                            ? <UserCheck className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                            : <UserX className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-muted-foreground hover:text-destructive"
                            onClick={() => { if (confirm("Remove employee?")) deleteTargetMutation.mutate({ orgId: orgId!, targetId: t.id }); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="departments" className="mt-4">
            {(departments ?? []).length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-16 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No departments yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create departments to organize your employees.</p>
                  <Button size="sm" onClick={() => setShowAddDept(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Department
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(departments ?? []).map((d) => {
                  const count = (targets ?? []).filter(t => t.departmentId === d.id).length;
                  return (
                    <Card key={d.id} className="border-border/60 hover:border-primary/30 transition-all group">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                            onClick={() => { if (confirm("Delete department?")) deleteDeptMutation.mutate({ orgId: orgId!, departmentId: d.id }); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="font-medium text-sm mb-0.5">{d.name}</div>
                
                        <div className="text-xs text-muted-foreground">{count} employee{count !== 1 ? "s" : ""}</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Employee dialog */}
      <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={empForm.firstName} onChange={e => setEmpForm(f => ({ ...f, firstName: e.target.value }))} className="bg-background border-border/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={empForm.lastName} onChange={e => setEmpForm(f => ({ ...f, lastName: e.target.value }))} className="bg-background border-border/60" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} className="bg-background border-border/60" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title (optional)</Label>
                <Input value={empForm.title} onChange={e => setEmpForm(f => ({ ...f, title: e.target.value }))} className="bg-background border-border/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Select value={empForm.departmentId} onValueChange={v => setEmpForm(f => ({ ...f, departmentId: v }))}>
                  <SelectTrigger className="bg-background border-border/60"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {(departments ?? []).map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEmployee(false)}>Cancel</Button>
            <Button
              disabled={!empForm.firstName || !empForm.lastName || !empForm.email || createTargetMutation.isPending}
              onClick={() => createTargetMutation.mutate({
                orgId: orgId!,
                firstName: empForm.firstName,
                lastName: empForm.lastName,
                email: empForm.email,
                title: empForm.title || undefined,
                departmentId: empForm.departmentId ? parseInt(empForm.departmentId) : undefined,
              })}
            >
              {createTargetMutation.isPending ? "Adding..." : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Department dialog */}
      <Dialog open={showAddDept} onOpenChange={setShowAddDept}>
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader><DialogTitle>Add Department</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Department Name</Label>
              <Input value={deptForm.name} onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Engineering" className="bg-background border-border/60" />
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDept(false)}>Cancel</Button>
            <Button
              disabled={!deptForm.name || createDeptMutation.isPending}
              onClick={() => createDeptMutation.mutate({ orgId: orgId!, name: deptForm.name })}
            >
              {createDeptMutation.isPending ? "Creating..." : "Create Department"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
