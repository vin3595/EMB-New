import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table";
import { Badge } from "./ui/badge";
import { formatINR } from "../lib/format";
import api from "../lib/api";

export default function ConvertToVouchersDialog({ sheetId, trigger, onCommitted }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .post("/vouchers/preview", { sheet_id: sheetId })
      .then((res) => setLines(res.data.lines))
      .catch(() => toast.error("Could not build voucher preview"));
  }, [open, sheetId]);

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const res = await api.post("/vouchers/commit", { sheet_id: sheetId, lines });
      toast.success(`${res.data.vouchers.length} vouchers created`);
      setOpen(false);
      setLines(null);
      onCommitted?.(res.data.vouchers);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not commit vouchers");
    } finally {
      setCommitting(false);
    }
  };

  const flaggedCount = (lines || []).filter((l) => l.compliance_flag).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl" data-testid="convert-to-vouchers-dialog">
        <DialogHeader>
          <DialogTitle>Convert to Vouchers</DialogTitle>
        </DialogHeader>
        {lines === null ? (
          <div className="h-40 animate-pulse bg-muted rounded-md" />
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nothing to convert — this sheet has no cash-out expenses or advances.</p>
        ) : (
          <>
            {flaggedCount > 0 && (
              <p data-testid="convert-40a3-warning" className="text-sm bg-destructive/10 text-destructive rounded-md p-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {flaggedCount} line(s) exceed the ₹10,000 Section 40A(3) cash limit and will be flagged as disallowed.
              </p>
            )}
            <Table data-testid="convert-to-vouchers-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, idx) => (
                  <TableRow key={idx} data-testid={`convert-line-${idx}`}>
                    <TableCell>{line.voucher_type}</TableCell>
                    <TableCell>{line.party || "—"}</TableCell>
                    <TableCell>{line.category || "—"}</TableCell>
                    <TableCell className="font-money">{formatINR(line.amount)}</TableCell>
                    <TableCell>{line.compliance_flag && <Badge variant="destructive">40A(3)</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        <DialogFooter>
          <Button data-testid="convert-to-vouchers-commit-button" onClick={handleCommit} disabled={committing || !lines?.length}>
            {committing ? "Creating…" : "Create Vouchers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
