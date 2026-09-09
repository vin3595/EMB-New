import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ScanLine, Trash2, UploadCloud } from "lucide-react";
import api from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
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

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("loading");
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
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

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/bills/scan", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(res.data.extracted);
      if (res.data.extracted.low_confidence) {
        toast.warning("Low-confidence extraction — please double-check before saving");
      } else {
        toast.success("Bill scanned — review and save");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not scan this image");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/bills/${id}`);
      toast.success(`Bill deleted (${res.data.cascaded.expenses_deleted} linked expense rows removed)`);
      loadBills();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not delete bill");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Bills</h1>
          <p className="text-sm text-muted-foreground">Scan a vendor bill or enter one manually.</p>
        </div>
        <div className="flex gap-2">
          <ManualBillDialog onSaved={loadBills} />
          <Button data-testid="scan-bill-button" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
            <ScanLine className="h-4 w-4 mr-2" /> {scanning ? "Scanning…" : "Scan Bill"}
          </Button>
          <input ref={fileInputRef} data-testid="scan-bill-file-input" type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
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
