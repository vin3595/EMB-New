import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import api from "../lib/api";
import { formatINR } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { LoadingRows, EmptyState, ErrorState } from "../components/StateViews";

function AddStaffDialog({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", designation: "", base_salary: 0, aliases: "" });

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Name is required");
      return;
    }
    try {
      await api.post("/staff", { ...form, aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean) });
      toast.success("Staff added");
      setOpen(false);
      setForm({ name: "", designation: "", base_salary: 0, aliases: "" });
      onAdded();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not add staff");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-staff-button">
          <Plus className="h-4 w-4 mr-2" /> Add Staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="staff-name">Name</Label>
            <Input data-testid="staff-name-input" id="staff-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="staff-designation">Designation</Label>
            <Input data-testid="staff-designation-input" id="staff-designation" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="staff-salary">Base Salary</Label>
            <Input data-testid="staff-salary-input" id="staff-salary" type="number" value={form.base_salary} onChange={(e) => setForm((f) => ({ ...f, base_salary: parseFloat(e.target.value) || 0 }))} className="font-money" />
          </div>
          <div>
            <Label htmlFor="staff-aliases">Handwriting aliases (comma separated)</Label>
            <Input data-testid="staff-aliases-input" id="staff-aliases" value={form.aliases} onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))} placeholder="e.g. Ramu, Ram" />
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="staff-save-button" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [status, setStatus] = useState("loading");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [staffRes, payrollRes] = await Promise.all([api.get("/staff"), api.get("/staff/payroll", { params: { month } })]);
      setStaff(staffRes.data.staff);
      setPayroll(payrollRes.data.payroll);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Staff & Payroll</h1>
          <p className="text-sm text-muted-foreground">Attendance is auto-marked whenever you save a daily sheet.</p>
        </div>
        <AddStaffDialog onAdded={load} />
      </div>

      {status === "loading" && <LoadingRows testId="staff-loading" />}
      {status === "error" && <ErrorState message="Could not load staff data." onRetry={load} testId="staff-error" />}

      {status === "ready" && (
        <Tabs defaultValue="staff">
          <TabsList>
            <TabsTrigger data-testid="staff-tab-staff" value="staff">Staff</TabsTrigger>
            <TabsTrigger data-testid="staff-tab-payroll" value="payroll">Payroll</TabsTrigger>
          </TabsList>
          <TabsContent value="staff">
            <Card>
              <CardContent className="pt-6">
                {staff.length === 0 ? (
                  <EmptyState testId="staff-empty" title="No staff added yet" />
                ) : (
                  <Table data-testid="staff-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Base Salary</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((s) => (
                        <TableRow key={s.id} data-testid={`staff-row-${s.id}`}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.designation || "—"}</TableCell>
                          <TableCell className="font-money">{formatINR(s.base_salary)}</TableCell>
                          <TableCell>
                            <Badge variant={s.active ? "success" : "secondary"}>{s.active ? "Active" : "Inactive"}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payroll">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Payroll</CardTitle>
                <Input data-testid="payroll-month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
              </CardHeader>
              <CardContent>
                {payroll.length === 0 ? (
                  <EmptyState testId="payroll-empty" title="No active staff for payroll" />
                ) : (
                  <Table data-testid="payroll-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Days Worked</TableHead>
                        <TableHead>Pro-rata Salary</TableHead>
                        <TableHead>Advances Outstanding</TableHead>
                        <TableHead>Net Payable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payroll.map((p) => (
                        <TableRow key={p.staff_id} data-testid={`payroll-row-${p.staff_id}`}>
                          <TableCell className="font-medium">{p.staff_name}</TableCell>
                          <TableCell>{p.days_worked} / {p.days_in_month}</TableCell>
                          <TableCell className="font-money">{formatINR(p.pro_rata_salary)}</TableCell>
                          <TableCell className="font-money">{formatINR(p.advances_outstanding)}</TableCell>
                          <TableCell className="font-money font-semibold">{formatINR(p.net_payable)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
