import React, { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";

export default function BarcodeLabelDialog({ lot }) {
  const [open, setOpen] = useState(false);
  const svgRef = useRef(null);

  useEffect(() => {
    if (open && svgRef.current) {
      JsBarcode(svgRef.current, lot.lot_number, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height: 60,
        margin: 8,
      });
    }
  }, [open, lot.lot_number]);

  const handlePrint = () => {
    const svgMarkup = svgRef.current.outerHTML;
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>${lot.lot_number}</title>
      <style>
        @page { size: 80mm 50mm; margin: 4mm; }
        body { font-family: Arial, sans-serif; text-align: center; }
        h2 { margin: 0 0 4px; font-size: 16px; }
        p { margin: 0 0 8px; font-size: 12px; color: #444; }
      </style></head><body>
      <h2>${lot.recipe_name}</h2>
      <p>${lot.quantity_produced}${lot.unit ? ` ${lot.unit}` : ""}${lot.expiry_date ? ` &middot; Exp: ${lot.expiry_date}` : ""}</p>
      ${svgMarkup}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid={`production-lot-label-${lot.id}`} variant="ghost" size="icon" title="View barcode label">
          <Tag className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" data-testid="barcode-label-dialog">
        <DialogHeader>
          <DialogTitle>{lot.recipe_name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 bg-white rounded-md p-4">
          <p className="text-sm text-muted-foreground">
            {lot.quantity_produced} {lot.unit}
            {lot.expiry_date ? ` · Exp: ${lot.expiry_date}` : ""}
          </p>
          <svg ref={svgRef} />
        </div>
        <DialogFooter>
          <Button data-testid={`production-lot-print-${lot.id}`} onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Print Label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
