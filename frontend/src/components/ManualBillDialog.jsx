import React, { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import BillForm, { emptyItem } from "./BillForm";
import api from "../lib/api";

function blankBill() {
  return {
    vendor: "",
    gstin: "",
    bill_date: new Date().toISOString().slice(0, 10),
    invoice_number: "",
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    round_off: 0,
    items: [emptyItem()],
  };
}

export default function ManualBillDialog({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [bill, setBill] = useState(blankBill());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!bill.vendor) {
      toast.error("Vendor name is required");
      return;
    }
    setSaving(true);
    try {
      const total = bill.items.reduce((s, i) => s + (Number(i.total) || 0), 0) + Number(bill.cgst_amount || 0) + Number(bill.sgst_amount || 0) + Number(bill.igst_amount || 0) + Number(bill.round_off || 0);
      const subtotal = bill.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
      await api.post("/bills", { ...bill, subtotal, total, source: "manual" });
      toast.success("Bill saved");
      setOpen(false);
      setBill(blankBill());
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="manual-bill-open-button" variant="outline">
          Enter bill manually
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manual Bill Entry</DialogTitle>
        </DialogHeader>
        <BillForm value={bill} onChange={setBill} testIdPrefix="manual-bill" />
        <DialogFooter>
          <Button data-testid="manual-bill-save-button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
