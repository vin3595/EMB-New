import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Wallet } from "lucide-react";
import api from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
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

function TransactionsDialog({ staff, trigger, onChanged }) {
  const [open, setOpen] = useState(false);
  const [txns, setTxns] = useState(null);
  const [form, setForm] = useState({ txn_type: "advance", amount: 0, note: "", txn_date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/staff/${staff.id}/transactions`);
      setTxns(res.data.transactions);
    } catch {
      toast.error("Could not load transactions");
    }
  }, [staff.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleAdd = async () => {
    if (!form.amount || form.amount <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/staff/${staff.id}/transactions`, form);
      toast.success(`${form.txn_type === "advance" ? "Advance" : "Repayment"} recorded`);
      setForm((f) => ({ ...f, amount: 0, note: "" }));
      load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not record transaction");
    } finally {
      setSaving(false);
    }
  };

  const latestBalance = txns && txns.length > 0 ? txns[0].balance_after : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="staff-transactions-dialog">
        <DialogHeader>
          <DialogTitle>{staff.name} — Advances</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div>
            <Label>Type</Label>
            <Select value={form.txn_type} onValueChange={(v) => setForm((f) => ({ ...f, txn_type: v }))}>
              <SelectTrigger data-testid="txn-type-select" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">Advance</SelectItem>
                <SelectItem value="repayment">Repayment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input data-testid="txn-amount-input" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="w-28 font-money" />
          </div>
          <div>
            <Label>Date</Label>
            <Input data-testid="txn-date-input" type="date" value={form.txn_date} onChange={(e) => setForm((f) => ({ ...f, txn_date: e.target.value }))} className="w-36" />
          </div>
          <div className="flex-1">
            <Label>Note</Label>
            <Input data-testid="txn-note-input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional" />
          </div>
          <Button data-testid="txn-add-button" onClick={handleAdd} disabled={saving}>Add</Button>
        </div>

        <div className="flex justify-between items-center pt-2">
          <p className="text-sm text-muted-foreground">Outstanding balance</p>
          <p className="font-money font-semibold">{formatINR(latestBalance)}</p>
        </div>

        {txns === null ? (
          <div className="h-24 animate-pulse bg-muted rounded-md" />
        ) : txns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet.</p>
        ) : (
          <Table data-testid="staff-transactions-table">
            <TableHeader>
              <TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Balance</TableHead><TableHead>Note</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDateIST(t.txn_date)}</TableCell>
                  <TableCell><Badge variant={t.txn_type === "advance" ? "warning" : "success"}>{t.txn_type}</Badge></TableCell>
                  <TableCell className="font-money">{formatINR(t.amount)}</TableCell>
                  <TableCell className="font-money">{formatINR(t.balance_after)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttendanceTab({ staff, month, setMonth }) {
  const [attendance, setAttendance] = useState(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/staff/attendance", { params: { month } });
      setAttendance(res.data.attendance);
    } catch {
      toast.error("Could not load attendance");
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedStaffId && staff.length > 0) setSelectedStaffId(staff[0].id);
  }, [staff, selectedStaffId]);

  const presentDates = useMemo(() => {
    const record = (attendance || []).find((a) => a.staff_id === selectedStaffId);
    return new Set(record?.present_dates || []);
  }, [attendance, selectedStaffId]);

  const calendarDays = useMemo(() => {
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const firstWeekday = new Date(year, mon - 1, 1).getDay();
    const cells = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso, present: presentDates.has(iso) });
    }
    return cells;
  }, [month, presentDates]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Attendance</CardTitle>
        <div className="flex gap-2">
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger data-testid="attendance-staff-select" className="w-48"><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input data-testid="attendance-month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
        </div>
      </CardHeader>
      <CardContent>
        {staff.length === 0 ? (
          <EmptyState testId="attendance-empty" title="Add a staff member first" />
        ) : attendance === null ? (
          <LoadingRows testId="attendance-loading" />
        ) : (
          <div>
            <div className="grid grid-cols-7 gap-1 max-w-md mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center text-xs text-muted-foreground font-medium">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 max-w-md" data-testid="attendance-calendar">
              {calendarDays.map((cell, idx) =>
                cell === null ? (
                  <div key={idx} />
                ) : (
                  <div
                    key={cell.iso}
                    data-testid={`attendance-day-${cell.iso}`}
                    className={`h-9 flex items-center justify-center rounded-md text-sm ${
                      cell.present ? "bg-success text-success-foreground font-medium" : "bg-secondary text-muted-foreground"
                    }`}
                    title={cell.present ? "Present" : "Absent / no sheet"}
                  >
                    {cell.day}
                  </div>
                )
              )}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-success inline-block" /> Present</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-secondary inline-block" /> Absent / no daily sheet</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [status, setStatus] = useState("loading");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");

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

  const filteredStaff = staff.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

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
            <TabsTrigger data-testid="staff-tab-attendance" value="attendance">Attendance</TabsTrigger>
          </TabsList>
          <TabsContent value="staff">
            <Card>
              <CardHeader>
                <Input
                  data-testid="staff-search-input"
                  placeholder="Search staff by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-xs"
                />
              </CardHeader>
              <CardContent>
                {staff.length === 0 ? (
                  <EmptyState testId="staff-empty" title="No staff added yet" />
                ) : filteredStaff.length === 0 ? (
                  <EmptyState testId="staff-search-empty" title="No staff match your search" />
                ) : (
                  <Table data-testid="staff-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Base Salary</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStaff.map((s) => (
                        <TableRow key={s.id} data-testid={`staff-row-${s.id}`}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.designation || "—"}</TableCell>
                          <TableCell className="font-money">{formatINR(s.base_salary)}</TableCell>
                          <TableCell>
                            <Badge variant={s.active ? "success" : "secondary"}>{s.active ? "Active" : "Inactive"}</Badge>
                          </TableCell>
                          <TableCell>
                            <TransactionsDialog
                              staff={s}
                              onChanged={load}
                              trigger={
                                <Button data-testid={`staff-advances-button-${s.id}`} variant="ghost" size="icon" title="Advances">
                                  <Wallet className="h-4 w-4" />
                                </Button>
                              }
                            />
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
          <TabsContent value="attendance">
            <AttendanceTab staff={staff} month={month} setMonth={setMonth} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
