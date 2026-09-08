import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Receipt } from "lucide-react";
import api from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Button } from "../components/ui/button";
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
import ConvertToVouchersDialog from "../components/ConvertToVouchersDialog";

export default function DailySheetHistory() {
  const [sheets, setSheets] = useState([]);
  const [status, setStatus] = useState("loading");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/daily-sheets");
      setSheets(res.data.sheets);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/daily-sheets/${id}`);
      const c = res.data.cascaded;
      toast.success(`Sheet deleted (${c.expenses} expenses, ${c.vijay_ras_entries} vijay ras entries, ${c.staff_transactions} staff txns, ${c.dues_entries} dues reversed)`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not delete sheet");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button data-testid="daily-sheet-history-back-button" variant="ghost" size="icon" onClick={() => navigate("/daily-sheet")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-semibold">Daily Sheet History</h1>
          <p className="text-sm text-muted-foreground">Reopen any past sheet to review or correct it.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sheets</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "loading" && <LoadingRows testId="daily-sheet-history-loading" />}
          {status === "error" && <ErrorState message="Could not load daily sheet history." onRetry={load} testId="daily-sheet-history-error" />}
          {status === "ready" && sheets.length === 0 && (
            <EmptyState testId="daily-sheet-history-empty" title="No daily sheets yet" description="Sheets you save will show up here." />
          )}
          {status === "ready" && sheets.length > 0 && (
            <Table data-testid="daily-sheet-history-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cash In</TableHead>
                  <TableHead>Cash Out</TableHead>
                  <TableHead>Vouchers</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((sheet) => (
                  <TableRow key={sheet.id} data-testid={`daily-sheet-row-${sheet.id}`}>
                    <TableCell
                      className="font-medium cursor-pointer hover:underline"
                      data-testid={`daily-sheet-open-${sheet.id}`}
                      onClick={() => navigate(`/daily-sheet?open=${sheet.id}`)}
                    >
                      {formatDateIST(sheet.sheet_date)}
                    </TableCell>
                    <TableCell className="font-money">{formatINR(sheet.cash_in)}</TableCell>
                    <TableCell className="font-money">{formatINR(sheet.cash_out)}</TableCell>
                    <TableCell>
                      {sheet.vouchers_generated?.length ? <Badge variant="success">{sheet.vouchers_generated.length} generated</Badge> : <Badge variant="secondary">None</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{sheet.source === "manual" ? "Manual" : "OCR"}</Badge>
                    </TableCell>
                    <TableCell className="flex items-center gap-1">
                      <ConvertToVouchersDialog
                        sheetId={sheet.id}
                        onCommitted={load}
                        trigger={
                          <Button data-testid={`daily-sheet-convert-${sheet.id}`} variant="ghost" size="icon" title="Convert to Vouchers">
                            <Receipt className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button data-testid={`daily-sheet-delete-${sheet.id}`} variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this daily sheet?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes every expense, vijay ras entry, staff transaction, dues entry, attendance mark, and voucher (with stock reversal) generated
                              from this sheet. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction data-testid={`daily-sheet-confirm-delete-${sheet.id}`} onClick={() => handleDelete(sheet.id)}>
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
