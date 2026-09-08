import React, { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import api from "../lib/api";

export default function VoucherSlipDialog({ voucherId, open, onOpenChange }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !voucherId) return;
    setLoading(true);
    api
      .get(`/vouchers/${voucherId}/slip`, { responseType: "text" })
      .then((res) => setHtml(res.data))
      .finally(() => setLoading(false));
  }, [open, voucherId]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="voucher-slip-dialog">
        <DialogHeader>
          <DialogTitle>Voucher Slip</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="h-[500px] animate-pulse bg-muted rounded-md" />
        ) : (
          <iframe data-testid="voucher-slip-iframe" title="Voucher Slip" srcDoc={html} className="w-full h-[500px] rounded-md border border-border bg-white" />
        )}
        <DialogFooter>
          <Button data-testid="voucher-slip-print-button" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Print as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
