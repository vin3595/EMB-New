import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table";
import { formatINR } from "../lib/format";

function emptyItem() {
  return { name: "", hsn: "", quantity: 1, unit: "pcs", unit_price: 0, mrp: null, discount_amount: 0, discount_percent: null, tax_rate: null, total: 0 };
}

export default function BillForm({ value, onChange, testIdPrefix = "bill" }) {
  const update = (patch) => onChange({ ...value, ...patch });

  const updateItem = (idx, patch) => {
    const items = value.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...value, items });
  };

  const addItem = () => onChange({ ...value, items: [...value.items, emptyItem()] });
  const removeItem = (idx) => onChange({ ...value, items: value.items.filter((_, i) => i !== idx) });

  const itemsTotal = value.items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const grandTotal = itemsTotal + Number(value.cgst_amount || 0) + Number(value.sgst_amount || 0) + Number(value.igst_amount || 0) + Number(value.round_off || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${testIdPrefix}-vendor`}>Vendor</Label>
          <Input data-testid={`${testIdPrefix}-vendor-input`} id={`${testIdPrefix}-vendor`} value={value.vendor || ""} onChange={(e) => update({ vendor: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${testIdPrefix}-gstin`}>GSTIN</Label>
          <Input data-testid={`${testIdPrefix}-gstin-input`} id={`${testIdPrefix}-gstin`} value={value.gstin || ""} onChange={(e) => update({ gstin: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${testIdPrefix}-date`}>Bill Date</Label>
          <Input data-testid={`${testIdPrefix}-date-input`} id={`${testIdPrefix}-date`} type="date" value={value.bill_date || ""} onChange={(e) => update({ bill_date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${testIdPrefix}-invoice-number`}>Invoice #</Label>
          <Input
            data-testid={`${testIdPrefix}-invoice-number-input`}
            id={`${testIdPrefix}-invoice-number`}
            value={value.invoice_number || ""}
            onChange={(e) => update({ invoice_number: e.target.value })}
          />
        </div>
      </div>

      <Table data-testid={`${testIdPrefix}-items-table`}>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>HSN</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Disc %</TableHead>
            <TableHead>GST %</TableHead>
            <TableHead>Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.items.map((item, idx) => (
            <TableRow key={idx} data-testid={`${testIdPrefix}-item-row-${idx}`}>
              <TableCell>
                <Input data-testid={`${testIdPrefix}-item-name-${idx}`} value={item.name} onChange={(e) => updateItem(idx, { name: e.target.value })} className="min-w-[140px]" />
              </TableCell>
              <TableCell>
                <Input data-testid={`${testIdPrefix}-item-hsn-${idx}`} value={item.hsn || ""} onChange={(e) => updateItem(idx, { hsn: e.target.value })} className="w-20" />
              </TableCell>
              <TableCell>
                <Input
                  data-testid={`${testIdPrefix}-item-qty-${idx}`}
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-20 font-money"
                />
              </TableCell>
              <TableCell>
                <Input data-testid={`${testIdPrefix}-item-unit-${idx}`} value={item.unit || ""} onChange={(e) => updateItem(idx, { unit: e.target.value })} className="w-16" />
              </TableCell>
              <TableCell>
                <Input
                  data-testid={`${testIdPrefix}-item-rate-${idx}`}
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                  className="w-24 font-money"
                />
              </TableCell>
              <TableCell>
                <Input
                  data-testid={`${testIdPrefix}-item-disc-${idx}`}
                  type="number"
                  value={item.discount_percent ?? ""}
                  onChange={(e) => updateItem(idx, { discount_percent: e.target.value === "" ? null : parseFloat(e.target.value) })}
                  className="w-16 font-money"
                />
              </TableCell>
              <TableCell>
                <Input
                  data-testid={`${testIdPrefix}-item-gst-${idx}`}
                  type="number"
                  value={item.tax_rate ?? ""}
                  onChange={(e) => updateItem(idx, { tax_rate: e.target.value === "" ? null : parseFloat(e.target.value) })}
                  className="w-16 font-money"
                />
              </TableCell>
              <TableCell>
                <Input
                  data-testid={`${testIdPrefix}-item-total-${idx}`}
                  type="number"
                  value={item.total}
                  onChange={(e) => updateItem(idx, { total: parseFloat(e.target.value) || 0 })}
                  className="w-24 font-money"
                />
              </TableCell>
              <TableCell>
                <Button data-testid={`${testIdPrefix}-item-remove-${idx}`} variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button data-testid={`${testIdPrefix}-add-item-button`} variant="outline" size="sm" onClick={addItem}>
        <Plus className="h-4 w-4 mr-1" /> Add item
      </Button>

      <div className="grid grid-cols-2 gap-3 max-w-md ml-auto">
        <Label htmlFor={`${testIdPrefix}-cgst`}>CGST</Label>
        <Input data-testid={`${testIdPrefix}-cgst-input`} id={`${testIdPrefix}-cgst`} type="number" value={value.cgst_amount || 0} onChange={(e) => update({ cgst_amount: parseFloat(e.target.value) || 0 })} className="font-money" />
        <Label htmlFor={`${testIdPrefix}-sgst`}>SGST</Label>
        <Input data-testid={`${testIdPrefix}-sgst-input`} id={`${testIdPrefix}-sgst`} type="number" value={value.sgst_amount || 0} onChange={(e) => update({ sgst_amount: parseFloat(e.target.value) || 0 })} className="font-money" />
        <Label htmlFor={`${testIdPrefix}-igst`}>IGST</Label>
        <Input data-testid={`${testIdPrefix}-igst-input`} id={`${testIdPrefix}-igst`} type="number" value={value.igst_amount || 0} onChange={(e) => update({ igst_amount: parseFloat(e.target.value) || 0 })} className="font-money" />
        <Label htmlFor={`${testIdPrefix}-round-off`}>Round Off</Label>
        <Input data-testid={`${testIdPrefix}-round-off-input`} id={`${testIdPrefix}-round-off`} type="number" value={value.round_off || 0} onChange={(e) => update({ round_off: parseFloat(e.target.value) || 0 })} className="font-money" />
      </div>

      <div className="flex justify-end">
        <p className="font-money text-lg font-semibold" data-testid={`${testIdPrefix}-computed-total`}>
          Total: {formatINR(grandTotal)}
        </p>
      </div>
    </div>
  );
}

export { emptyItem };
