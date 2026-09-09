import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Eye, History, Mail, Printer, Trash2 } from "lucide-react";
import api from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { LoadingRows, EmptyState, ErrorState } from "../components/StateViews";
import VoucherSlipDialog from "../components/VoucherSlipDialog";

const VOUCHER_TYPES = ["Payment", "Bank Payment", "Salary", "Drawings", "Advance", "CAPEX", "Journal"];

function downloadBlob(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BackfillDialog({ onDone }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ date_from: "", date_to: "" });
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!range.date_from || !range.date_to) {
      toast.error("Pick both dates");
      return;
    }
    setRunning(true);
    try {
      const res = await api.post("/vouchers/backfill", null, { params: range });
      toast.success(`Processed ${res.data.sheets_processed} sheets, created ${res.data.vouchers_created} vouchers`);
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Backfill failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="vouchers-backfill-button" variant="outline">
          <History className="h-4 w-4 mr-2" /> Backfill
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="backfill-dialog">
        <DialogHeader>
          <DialogTitle>Backfill Historical Vouchers</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Generates vouchers for every daily sheet in this range that hasn't been converted yet. Safe to run repeatedly — sheets that already have vouchers are skipped.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="backfill-from">From</Label>
            <Input data-testid="backfill-date-from" id="backfill-from" type="date" value={range.date_from} onChange={(e) => setRange((r) => ({ ...r, date_from: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="backfill-to">To</Label>
            <Input data-testid="backfill-date-to" id="backfill-to" type="date" value={range.date_to} onChange={(e) => setRange((r) => ({ ...r, date_to: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="backfill-run-button" onClick={handleRun} disabled={running}>
            {running ? "Running…" : "Run Backfill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Vouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [status, setStatus] = useState("loading");
  const [filters, setFilters] = useState({ date_from: "", date_to: "", voucher_type: "", party: "", flagged_only: false });
  const [selected, setSelected] = useState(new Set());
  const [slipVoucherId, setSlipVoucherId] = useState(null);

  const activeFilters = useMemo(() => {
    const f = {};
    if (filters.date_from) f.date_from = filters.date_from;
    if (filters.date_to) f.date_to = filters.date_to;
    if (filters.voucher_type) f.voucher_type = filters.voucher_type;
    if (filters.party) f.party = filters.party;
    if (filters.flagged_only) f.flagged_only = true;
    return f;
  }, [filters]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/vouchers", { params: activeFilters });
      setVouchers(res.data.vouchers);
      setTotalAmount(res.data.total_amount);
      setSelected(new Set());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [activeFilters]);

  useEffect(() => {
    load();
  }, [load]);

  const allSelected = vouchers.length > 0 && selected.size === vouchers.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(vouchers.map((v) => v.id)));
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedTotal = vouchers.filter((v) => selected.has(v.id)).reduce((s, v) => s + v.amount, 0);

  const handleBulkDelete = async () => {
    try {
      const res = await api.post("/vouchers/bulk-delete", { voucher_ids: Array.from(selected) });
      toast.success(`${res.data.cascaded.vouchers_deleted} vouchers deleted (${res.data.cascaded.stock_ledger_reversed} stock entries reversed)`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not delete vouchers");
    }
  };

  const handleExport = async (kind) => {
    try {
      const res = await api.get(`/vouchers/export/${kind}`, { params: activeFilters, responseType: kind === "tally" ? "text" : "blob" });
      if (kind === "tally") downloadBlob(res.data, "vouchers.xml", "application/xml");
      else downloadBlob(res.data, "vouchers.csv", "text/csv");
    } catch {
      toast.error("Export failed");
    }
  };

  const handlePrintBulk = async () => {
    try {
      const res = await api.post("/vouchers/print-bulk", null, { params: activeFilters, responseType: "text" });
      const win = window.open("", "_blank");
      win.document.write(res.data);
      win.document.close();
      win.focus();
      win.print();
    } catch {
      toast.error("Could not build printable pack");
    }
  };

  const handleEmailCA = async () => {
    if (!filters.date_from || !filters.date_to) {
      toast.error("Pick a date range first");
      return;
    }
    try {
      const res = await api.post("/vouchers/export/email", null, { params: { date_from: filters.date_from, date_to: filters.date_to } });
      toast.success(`Sent ${res.data.vouchers_sent} vouchers to your CA`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not email voucher pack");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Vouchers</h1>
          <p className="text-sm text-muted-foreground">CA-ready accounting vouchers generated from your daily sheets.</p>
        </div>
        <div className="flex gap-2">
          <BackfillDialog onDone={load} />
          <Button data-testid="vouchers-export-tally-button" variant="outline" onClick={() => handleExport("tally")}>
            <Download className="h-4 w-4 mr-2" /> Tally XML
          </Button>
          <Button data-testid="vouchers-export-csv-button" variant="outline" onClick={() => handleExport("csv")}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button data-testid="vouchers-print-bulk-button" variant="outline" onClick={handlePrintBulk}>
            <Printer className="h-4 w-4 mr-2" /> Print all as PDF
          </Button>
          <Button data-testid="vouchers-email-ca-button" variant="accent" onClick={handleEmailCA}>
            <Mail className="h-4 w-4 mr-2" /> Email CA
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label htmlFor="filter-date-from">From</Label>
            <Input data-testid="voucher-filter-date-from" id="filter-date-from" type="date" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="filter-date-to">To</Label>
            <Input data-testid="voucher-filter-date-to" id="filter-date-to" type="date" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={filters.voucher_type || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, voucher_type: v === "all" ? "" : v }))}>
              <SelectTrigger data-testid="voucher-filter-type"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-party">Party</Label>
            <Input data-testid="voucher-filter-party" id="filter-party" value={filters.party} onChange={(e) => setFilters((f) => ({ ...f, party: e.target.value }))} placeholder="Search party" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox data-testid="voucher-filter-flagged-only" checked={filters.flagged_only} onCheckedChange={(v) => setFilters((f) => ({ ...f, flagged_only: !!v }))} />
            <Label>Flagged only (40A3)</Label>
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div data-testid="voucher-bulk-bar" className="sticky top-2 z-10 flex items-center justify-between rounded-md border border-border bg-card p-3 shadow-md">
          <span className="text-sm font-medium">
            {selected.size} selected · <span className="font-money">{formatINR(selectedTotal)}</span>
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button data-testid="voucher-bulk-delete-button" variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" /> Delete selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.size} vouchers?</AlertDialogTitle>
                <AlertDialogDescription>
                  This reverses every stock ledger entry these vouchers created and pulls them from their source daily sheet's backlink. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="voucher-bulk-confirm-delete" onClick={handleBulkDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {vouchers.length} vouchers · <span className="font-money">{formatINR(totalAmount)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === "loading" && <LoadingRows testId="vouchers-loading" />}
          {status === "error" && <ErrorState message="Could not load vouchers." onRetry={load} testId="vouchers-error" />}
          {status === "ready" && vouchers.length === 0 && (
            <EmptyState testId="vouchers-empty" title="No vouchers found" description="Convert a daily sheet to vouchers, or widen your filters." />
          )}
          {status === "ready" && vouchers.length > 0 && (
            <Table data-testid="vouchers-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox data-testid="voucher-select-all" checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Voucher #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v) => (
                  <TableRow key={v.id} data-testid={`voucher-row-${v.id}`}>
                    <TableCell>
                      <Checkbox data-testid={`voucher-select-${v.id}`} checked={selected.has(v.id)} onCheckedChange={() => toggleOne(v.id)} />
                    </TableCell>
                    <TableCell className="font-money">{v.voucher_number}</TableCell>
                    <TableCell>{v.voucher_type}</TableCell>
                    <TableCell>{formatDateIST(v.voucher_date)}</TableCell>
                    <TableCell>{v.party || "—"}</TableCell>
                    <TableCell className="font-money">{formatINR(v.amount)}</TableCell>
                    <TableCell>
                      {v.compliance_flag && (
                        <Badge variant="destructive" data-testid={`voucher-flag-${v.id}`}>
                          <AlertTriangle className="h-3 w-3 mr-1" /> 40A(3)
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button data-testid={`voucher-view-${v.id}`} variant="ghost" size="icon" onClick={() => setSlipVoucherId(v.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <VoucherSlipDialog voucherId={slipVoucherId} open={!!slipVoucherId} onOpenChange={(v) => !v && setSlipVoucherId(null)} />
    </div>
  );
}
