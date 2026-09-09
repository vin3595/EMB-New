import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Link as LinkIcon, Mail, MessageCircle, Plus } from "lucide-react";
import api, { BACKEND_URL } from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { LoadingRows, EmptyState, ErrorState } from "../components/StateViews";

function emptyInvoiceItem() {
  return { name: "", hsn: "", quantity: 1, unit_price: 0, tax_rate: 18 };
}

function CreateInvoiceDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    invoice_date: new Date().toISOString().slice(0, 10),
    customer_name: "",
    customer_gstin: "",
    customer_phone: "",
    customer_email: "",
    theme: "classic",
    is_intra_state: true,
    items: [emptyInvoiceItem()],
  });

  const updateItem = (idx, patch) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyInvoiceItem()] }));

  const handleSave = async () => {
    if (!form.customer_name) return toast.error("Customer name is required");
    try {
      await api.post("/invoices", form);
      toast.success("Invoice created");
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not create invoice");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="create-invoice-button"><Plus className="h-4 w-4 mr-2" /> New Invoice</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Customer Name</Label><Input data-testid="invoice-customer-name-input" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} /></div>
            <div><Label>Customer GSTIN</Label><Input data-testid="invoice-customer-gstin-input" value={form.customer_gstin} onChange={(e) => setForm((f) => ({ ...f, customer_gstin: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input data-testid="invoice-customer-phone-input" value={form.customer_phone} onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))} /></div>
            <div><Label>Email</Label><Input data-testid="invoice-customer-email-input" value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} /></div>
            <div>
              <Label>Theme</Label>
              <Select value={form.theme} onValueChange={(v) => setForm((f) => ({ ...f, theme: v }))}>
                <SelectTrigger data-testid="invoice-theme-select"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="classic">Classic</SelectItem><SelectItem value="colored">Colored</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between"><Label>Items</Label><Button data-testid="invoice-add-item-button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add</Button></div>
            {form.items.map((it, idx) => (
              <div key={idx} className="flex gap-2 mt-2" data-testid={`invoice-item-row-${idx}`}>
                <Input placeholder="Item" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} className="flex-1" />
                <Input type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="w-20" />
                <Input type="number" placeholder="Rate" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })} className="w-24" />
                <Input type="number" placeholder="GST%" value={it.tax_rate} onChange={(e) => updateItem(idx, { tax_rate: parseFloat(e.target.value) || 0 })} className="w-20" />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button data-testid="invoice-save-button" onClick={handleSave}>Create Invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/invoices");
      setInvoices(res.data.invoices);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePaymentLink = async (id) => {
    try {
      const res = await api.post(`/invoices/${id}/payment-link`);
      await navigator.clipboard.writeText(res.data.payment_link);
      toast.success("Payment link copied to clipboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not create payment link");
    }
  };

  const handleSendEmail = async (id) => {
    try {
      await api.post(`/invoices/${id}/send-email`);
      toast.success("Invoice emailed");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not send email");
    }
  };

  const handleSendWhatsapp = async (id) => {
    try {
      await api.post(`/invoices/${id}/send-whatsapp`);
      toast.success("Invoice sent via WhatsApp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not send WhatsApp message");
    }
  };

  const handlePaymentStatusChange = async (id, payment_status) => {
    try {
      await api.patch(`/invoices/${id}/payment-status`, { payment_status });
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, payment_status } : inv)));
      toast.success("Payment status updated");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update payment status");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Create outgoing sales invoices with GST.</p>
        </div>
        <CreateInvoiceDialog onCreated={load} />
      </div>

      <Card>
        <CardHeader><CardTitle>All Invoices</CardTitle></CardHeader>
        <CardContent>
          {status === "loading" && <LoadingRows testId="invoices-loading" />}
          {status === "error" && <ErrorState message="Could not load invoices." onRetry={load} testId="invoices-error" />}
          {status === "ready" && invoices.length === 0 && <EmptyState testId="invoices-empty" title="No invoices yet" />}
          {status === "ready" && invoices.length > 0 && (
            <Table data-testid="invoices-table">
              <TableHeader>
                <TableRow><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                    <TableCell className="font-money">{inv.invoice_number}</TableCell>
                    <TableCell>{formatDateIST(inv.invoice_date)}</TableCell>
                    <TableCell>{inv.customer_name}</TableCell>
                    <TableCell className="font-money">{formatINR(inv.total)}</TableCell>
                    <TableCell>
                      <Select value={inv.payment_status} onValueChange={(v) => handlePaymentStatusChange(inv.id, v)}>
                        <SelectTrigger data-testid={`invoice-payment-status-${inv.id}`} className="w-28 h-8">
                          <SelectValue>
                            <Badge variant={inv.payment_status === "paid" ? "success" : inv.payment_status === "partial" ? "warning" : "secondary"}>
                              {inv.payment_status}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">Unpaid</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button data-testid={`invoice-download-pdf-${inv.id}`} variant="ghost" size="icon" title="Download PDF" onClick={() => window.open(`${BACKEND_URL}/api/invoices/${inv.id}/pdf`, "_blank")}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button data-testid={`invoice-payment-link-${inv.id}`} variant="ghost" size="icon" title="Payment Link" onClick={() => handlePaymentLink(inv.id)}>
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                      <Button data-testid={`invoice-send-email-${inv.id}`} variant="ghost" size="icon" title="Email" onClick={() => handleSendEmail(inv.id)}>
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button data-testid={`invoice-send-whatsapp-${inv.id}`} variant="ghost" size="icon" title="WhatsApp" onClick={() => handleSendWhatsapp(inv.id)}>
                        <MessageCircle className="h-4 w-4" />
                      </Button>
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
