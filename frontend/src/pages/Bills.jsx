import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, RefreshCw, ScanLine, Trash2, UploadCloud, X } from "lucide-react";
import api from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
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
import { LoadingRows, EmptyState, ErrorState } from "../components/StateViews";
import BillForm from "../components/BillForm";
import ManualBillDialog from "../components/ManualBillDialog";

function BatchItemEditDialog({ item, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid={`batch-edit-${item.localId}`} variant="ghost" size="icon" title="Review before saving">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review — {item.fileName}</DialogTitle>
        </DialogHeader>
        {item.extracted.confidence_note && (
          <p className="text-sm text-warning-foreground bg-warning/20 rounded-md p-2">{item.extracted.confidence_note}</p>
        )}
        <BillForm value={item.extracted} onChange={(v) => onChange(item.localId, v)} testIdPrefix={`batch-${item.localId}`} />
        <DialogFooter>
          <Button data-testid={`batch-edit-done-${item.localId}`} onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchRow({ item, onSave, onRemove, onRetry, onChange }) {
  return (
    <div className="flex items-center gap-3 border border-border rounded-md p-3" data-testid={`batch-row-${item.localId}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.fileName}</p>
        {item.status === "queued" && <p className="text-xs text-muted-foreground">Waiting to scan…</p>}
        {item.status === "scanning" && <p className="text-xs text-muted-foreground animate-pulse">Scanning…</p>}
        {item.status === "error" && <p className="text-xs text-destructive">{item.error}</p>}
        {(item.status === "done" || item.status === "saved") && (
          <p className="text-sm text-muted-foreground">
            {item.extracted.vendor || "Unknown vendor"} · <span className="font-money">{formatINR(item.extracted.total)}</span>
          </p>
        )}
      </div>
      {item.status === "done" && item.extracted.low_confidence && (
        <Badge variant="warning" data-testid={`batch-low-confidence-${item.localId}`}>
          <AlertTriangle className="h-3 w-3 mr-1" /> Low confidence
        </Badge>
      )}
      {item.status === "saved" && (
        <Badge variant="success"><Check className="h-3 w-3 mr-1" /> Saved</Badge>
      )}
      <div className="flex gap-1">
        {item.status === "error" && (
          <Button data-testid={`batch-retry-${item.localId}`} variant="ghost" size="icon" onClick={() => onRetry(item.localId)} title="Retry">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        {item.status === "done" && (
          <>
            <BatchItemEditDialog item={item} onChange={onChange} />
            <Button data-testid={`batch-save-${item.localId}`} size="sm" onClick={() => onSave(item.localId)}>
              Save
            </Button>
          </>
        )}
        {item.status !== "scanning" && (
          <Button data-testid={`batch-remove-${item.localId}`} variant="ghost" size="icon" onClick={() => onRemove(item.localId)} title="Remove from batch">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("loading");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [batch, setBatch] = useState([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const fileInputRef = useRef(null);

  const loadBills = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/bills");
      setBills(res.data.bills);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const filteredBills = bills.filter((b) => {
    const q = search.toLowerCase();
    return b.vendor.toLowerCase().includes(q) || (b.invoice_number || "").toLowerCase().includes(q);
  });

  const scanOne = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/bills/scan", formData, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data.extracted;
  };

  const handleSinglePreview = async (file) => {
    try {
      const extracted = await scanOne(file);
      setPreview(extracted);
      if (extracted.low_confidence) {
        toast.warning("Low-confidence extraction — please double-check before saving");
      } else {
        toast.success("Bill scanned — review and save");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not scan this image");
    }
  };

  const runBatchScan = async (items) => {
    setBatchRunning(true);
    for (const item of items) {
      setBatch((prev) => prev.map((b) => (b.localId === item.localId ? { ...b, status: "scanning" } : b)));
      try {
        const extracted = await scanOne(item.file);
        setBatch((prev) => prev.map((b) => (b.localId === item.localId ? { ...b, status: "done", extracted } : b)));
      } catch (err) {
        setBatch((prev) =>
          prev.map((b) => (b.localId === item.localId ? { ...b, status: "error", error: err.response?.data?.detail || "Scan failed" } : b))
        );
      }
    }
    setBatchRunning(false);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length === 1) {
      await handleSinglePreview(files[0]);
    } else {
      const items = files.map((file, idx) => ({
        localId: `${Date.now()}-${idx}`,
        fileName: file.name,
        file,
        status: "queued",
        extracted: null,
        error: null,
      }));
      setBatch((prev) => [...prev, ...items]);
      toast.success(`Scanning ${items.length} bills — this can take a few minutes`);
      runBatchScan(items);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSavePreview = async () => {
    setSaving(true);
    try {
      await api.post("/bills", preview);
      toast.success("Bill saved");
      setPreview(null);
      loadBills();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save bill");
    } finally {
      setSaving(false);
    }
  };

  const handleBatchChange = (localId, extracted) => {
    setBatch((prev) => prev.map((b) => (b.localId === localId ? { ...b, extracted } : b)));
  };

  const handleBatchSave = async (localId) => {
    const item = batch.find((b) => b.localId === localId);
    if (!item?.extracted) return;
    try {
      await api.post("/bills", item.extracted);
      setBatch((prev) => prev.map((b) => (b.localId === localId ? { ...b, status: "saved" } : b)));
      loadBills();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save bill");
    }
  };

  const handleBatchRemove = (localId) => {
    setBatch((prev) => prev.filter((b) => b.localId !== localId));
  };

  const handleBatchRetry = (localId) => {
    const item = batch.find((b) => b.localId === localId);
    if (item) runBatchScan([item]);
  };

  const handleSaveAll = async () => {
    const toSave = batch.filter((b) => b.status === "done" && !b.extracted.low_confidence);
    if (toSave.length === 0) {
      toast.error("Nothing ready to save — low-confidence bills need a quick review first");
      return;
    }
    setSavingAll(true);
    let savedCount = 0;
    for (const item of toSave) {
      try {
        await api.post("/bills", item.extracted);
        setBatch((prev) => prev.map((b) => (b.localId === item.localId ? { ...b, status: "saved" } : b)));
        savedCount++;
      } catch {
        // leave it as "done" so the user can retry individually
      }
    }
    setSavingAll(false);
    toast.success(`Saved ${savedCount} of ${toSave.length} bills`);
    loadBills();
  };

  const handleClearBatch = () => setBatch((prev) => prev.filter((b) => b.status !== "saved"));

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/bills/${id}`);
      toast.success(`Bill deleted (${res.data.cascaded.expenses_deleted} linked expense rows removed)`);
      loadBills();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not delete bill");
    }
  };

  const doneCount = batch.filter((b) => b.status === "done" || b.status === "saved").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Bills</h1>
          <p className="text-sm text-muted-foreground">Scan a vendor bill (or select several at once) or enter one manually.</p>
        </div>
        <div className="flex gap-2">
          <ManualBillDialog onSaved={loadBills} />
          <Button data-testid="scan-bill-button" onClick={() => fileInputRef.current?.click()} disabled={batchRunning}>
            <ScanLine className="h-4 w-4 mr-2" /> {batchRunning ? "Scanning…" : "Scan Bill(s)"}
          </Button>
          <input
            ref={fileInputRef}
            data-testid="scan-bill-file-input"
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
        </div>
      </div>

      {preview && (
        <Card data-testid="bill-preview-card">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Review Extracted Bill</CardTitle>
            {preview.low_confidence && (
              <Badge variant="warning" data-testid="bill-low-confidence-badge">
                <AlertTriangle className="h-3 w-3 mr-1" /> Low confidence
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.confidence_note && <p className="text-sm text-warning-foreground bg-warning/20 rounded-md p-2">{preview.confidence_note}</p>}
            <BillForm value={preview} onChange={setPreview} testIdPrefix="preview-bill" />
            <div className="flex justify-end gap-2">
              <Button data-testid="bill-preview-discard-button" variant="ghost" onClick={() => setPreview(null)}>
                Discard
              </Button>
              <Button data-testid="bill-preview-save-button" onClick={handleSavePreview} disabled={saving}>
                {saving ? "Saving…" : "Save Bill"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {batch.length > 0 && (
        <Card data-testid="batch-scan-card">
          <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle>
              Batch Scan — {doneCount}/{batch.length} scanned
            </CardTitle>
            <div className="flex gap-2">
              <Button data-testid="batch-save-all-button" onClick={handleSaveAll} disabled={savingAll || batchRunning}>
                {savingAll ? "Saving…" : "Save All Ready"}
              </Button>
              <Button data-testid="batch-clear-button" variant="outline" onClick={handleClearBatch}>
                Clear Saved
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {batch.map((item) => (
              <BatchRow
                key={item.localId}
                item={item}
                onSave={handleBatchSave}
                onRemove={handleBatchRemove}
                onRetry={handleBatchRetry}
                onChange={handleBatchChange}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Bills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "ready" && bills.length > 0 && (
            <Input
              data-testid="bills-search-input"
              placeholder="Search by vendor or invoice #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          )}
          {status === "loading" && <LoadingRows testId="bills-loading" />}
          {status === "error" && <ErrorState message="Could not load bills." onRetry={loadBills} testId="bills-error" />}
          {status === "ready" && bills.length === 0 && (
            <EmptyState
              testId="bills-empty"
              title="No bills yet"
              description="Scan your first vendor bill to get started."
              action={
                <Button data-testid="bills-empty-scan-button" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4 mr-2" /> Scan a bill
                </Button>
              }
            />
          )}
          {status === "ready" && bills.length > 0 && filteredBills.length === 0 && (
            <EmptyState testId="bills-search-empty" title="No bills match your search" />
          )}
          {status === "ready" && filteredBills.length > 0 && (
            <Table data-testid="bills-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((bill) => (
                  <TableRow key={bill.id} data-testid={`bill-row-${bill.id}`}>
                    <TableCell className="font-medium">{bill.vendor}</TableCell>
                    <TableCell>{formatDateIST(bill.bill_date)}</TableCell>
                    <TableCell>{bill.invoice_number || "—"}</TableCell>
                    <TableCell className="font-money">{formatINR(bill.total)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{bill.source === "manual" ? "Manual" : "OCR"}</Badge>
                      {bill.low_confidence && (
                        <Badge variant="warning" className="ml-1">
                          Low conf.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button data-testid={`bill-delete-button-${bill.id}`} variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this bill?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will also delete every expense row linked to this bill ({bill.expense_ids?.length || 0} rows). This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction data-testid={`bill-confirm-delete-${bill.id}`} onClick={() => handleDelete(bill.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
