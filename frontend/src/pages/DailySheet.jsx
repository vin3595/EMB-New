import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, ScanLine, Trash2, History } from "lucide-react";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { formatINR } from "../lib/format";

function blankSheet() {
  return {
    id: null,
    sheet_date: new Date().toISOString().slice(0, 10),
    cash_in: 0,
    cash_out: 0,
    vijay_ras_bhandar: [],
    vijay_ras: [],
    expenses: [],
    absent_staff: [],
    advances: [],
    dues_collected: [],
    source: "manual",
    low_confidence: false,
  };
}

function Section({ title, children, onAdd, testId }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {onAdd && (
          <Button data-testid={`${testId}-add-button`} variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

export default function DailySheet() {
  const [sheet, setSheet] = useState(blankSheet());
  const [items, setItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/items").then((res) => setItems(res.data.items)).catch(() => {});
  }, []);

  const loadExisting = useCallback(async (id) => {
    try {
      const res = await api.get(`/daily-sheets/${id}`);
      setSheet(res.data.sheet);
    } catch {
      toast.error("Could not load that daily sheet");
    }
  }, []);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) loadExisting(openId);
  }, [searchParams, loadExisting]);

  const suggestedPrice = (name) => {
    const match = items.find((i) => i.name.toLowerCase() === (name || "").toLowerCase());
    return match?.last_unit_price ?? null;
  };

  const update = (patch) => setSheet((s) => ({ ...s, ...patch }));
  const updateArrayItem = (key, idx, patch) => setSheet((s) => ({ ...s, [key]: s[key].map((row, i) => (i === idx ? { ...row, ...patch } : row)) }));
  const addRow = (key, blank) => setSheet((s) => ({ ...s, [key]: [...s[key], blank] }));
  const removeRow = (key, idx) => setSheet((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== idx) }));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/daily-sheets/scan", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const extracted = res.data.extracted;
      setSheet((s) => ({
        ...s,
        cash_in: extracted.cash_in || 0,
        cash_out: extracted.cash_out || 0,
        vijay_ras_bhandar: extracted.vijay_ras_bhandar || [],
        vijay_ras: extracted.vijay_ras || [],
        expenses: extracted.expenses || [],
        absent_staff: extracted.absent_staff || [],
        advances: extracted.advances || [],
        dues_collected: extracted.dues_collected || [],
        source: "ocr",
        low_confidence: extracted.low_confidence,
      }));
      toast.success("Daily sheet scanned — review and save");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not scan this image");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.post("/daily-sheets", sheet);
      toast.success(sheet.id ? "Daily sheet updated" : "Daily sheet saved");
      setSheet(res.data.sheet);
      navigate(`/daily-sheet?open=${res.data.sheet.id}`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save daily sheet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Daily Sheet</h1>
          <p className="text-sm text-muted-foreground">Photograph the day-book, or fill it in by hand.</p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="daily-sheet-history-button" variant="outline" onClick={() => navigate("/daily-sheet/history")}>
            <History className="h-4 w-4 mr-2" /> History
          </Button>
          <Button data-testid="scan-daily-sheet-button" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
            <ScanLine className="h-4 w-4 mr-2" /> {scanning ? "Scanning…" : "Scan Sheet"}
          </Button>
          <input ref={fileInputRef} data-testid="scan-daily-sheet-file-input" type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {sheet.low_confidence && (
        <p data-testid="daily-sheet-low-confidence-banner" className="text-sm text-warning-foreground bg-warning/20 rounded-md p-2">
          This scan looked unclear in places — please review every section below carefully.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <Label htmlFor="sheet-date">Date</Label>
          <Input data-testid="daily-sheet-date-input" id="sheet-date" type="date" value={sheet.sheet_date} onChange={(e) => update({ sheet_date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cash-in">Cash In</Label>
          <Input data-testid="daily-sheet-cash-in-input" id="cash-in" type="number" value={sheet.cash_in} onChange={(e) => update({ cash_in: parseFloat(e.target.value) || 0 })} className="font-money" />
        </div>
        <div>
          <Label htmlFor="cash-out">Cash Out</Label>
          <Input data-testid="daily-sheet-cash-out-input" id="cash-out" type="number" value={sheet.cash_out} onChange={(e) => update({ cash_out: parseFloat(e.target.value) || 0 })} className="font-money" />
        </div>
      </div>

      <Section title="Expenses" testId="daily-sheet-expenses-section" onAdd={() => addRow("expenses", { item: "", amount: 0, unit_price: null, quantity: null, category: "Daily Expense" })}>
        {sheet.expenses.map((row, idx) => {
          const suggestion = suggestedPrice(row.item);
          return (
            <div key={idx} className="flex items-center gap-2" data-testid={`expense-row-${idx}`}>
              <Input data-testid={`expense-item-${idx}`} placeholder="Item" value={row.item} onChange={(e) => updateArrayItem("expenses", idx, { item: e.target.value })} className="flex-1" />
              <Input data-testid={`expense-amount-${idx}`} type="number" placeholder="Amount" value={row.amount} onChange={(e) => updateArrayItem("expenses", idx, { amount: parseFloat(e.target.value) || 0 })} className="w-28 font-money" />
              {suggestion != null && (
                <Button data-testid={`expense-accept-price-${idx}`} type="button" variant="secondary" size="sm" onClick={() => updateArrayItem("expenses", idx, { unit_price: suggestion })}>
                  Use {formatINR(suggestion)}
                </Button>
              )}
              <Button data-testid={`expense-remove-${idx}`} variant="ghost" size="icon" onClick={() => removeRow("expenses", idx)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </Section>

      <Section title="Vijay Ras Bhandar (retail incoming)" testId="daily-sheet-vrb-section" onAdd={() => addRow("vijay_ras_bhandar", { item: "", quantity: 0, unit: "", amount: 0 })}>
        {sheet.vijay_ras_bhandar.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2" data-testid={`vrb-row-${idx}`}>
            <Input placeholder="Item" value={row.item} onChange={(e) => updateArrayItem("vijay_ras_bhandar", idx, { item: e.target.value })} className="flex-1" />
            <Input type="number" placeholder="Qty" value={row.quantity} onChange={(e) => updateArrayItem("vijay_ras_bhandar", idx, { quantity: parseFloat(e.target.value) || 0 })} className="w-20 font-money" />
            <Input placeholder="Unit" value={row.unit || ""} onChange={(e) => updateArrayItem("vijay_ras_bhandar", idx, { unit: e.target.value })} className="w-16" />
            <Input type="number" placeholder="Amount" value={row.amount} onChange={(e) => updateArrayItem("vijay_ras_bhandar", idx, { amount: parseFloat(e.target.value) || 0 })} className="w-24 font-money" />
            <Button variant="ghost" size="icon" onClick={() => removeRow("vijay_ras_bhandar", idx)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </Section>

      <Section title="Vijay Ras (wholesale outgoing)" testId="daily-sheet-vr-section" onAdd={() => addRow("vijay_ras", { item: "", quantity: 0, unit: "", amount: 0 })}>
        {sheet.vijay_ras.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2" data-testid={`vr-row-${idx}`}>
            <Input placeholder="Item" value={row.item} onChange={(e) => updateArrayItem("vijay_ras", idx, { item: e.target.value })} className="flex-1" />
            <Input type="number" placeholder="Qty" value={row.quantity} onChange={(e) => updateArrayItem("vijay_ras", idx, { quantity: parseFloat(e.target.value) || 0 })} className="w-20 font-money" />
            <Input placeholder="Unit" value={row.unit || ""} onChange={(e) => updateArrayItem("vijay_ras", idx, { unit: e.target.value })} className="w-16" />
            <Input type="number" placeholder="Amount" value={row.amount} onChange={(e) => updateArrayItem("vijay_ras", idx, { amount: parseFloat(e.target.value) || 0 })} className="w-24 font-money" />
            <Button variant="ghost" size="icon" onClick={() => removeRow("vijay_ras", idx)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </Section>

      <Section title="Absent Staff" testId="daily-sheet-absent-section" onAdd={() => addRow("absent_staff", "")}>
        <div className="flex flex-wrap gap-2">
          {sheet.absent_staff.map((name, idx) => (
            <div key={idx} className="flex items-center gap-1" data-testid={`absent-row-${idx}`}>
              <Input value={name} onChange={(e) => setSheet((s) => ({ ...s, absent_staff: s.absent_staff.map((n, i) => (i === idx ? e.target.value : n)) }))} className="w-40" />
              <Button variant="ghost" size="icon" onClick={() => removeRow("absent_staff", idx)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Advances Given" testId="daily-sheet-advances-section" onAdd={() => addRow("advances", { staff_name: "", amount: 0, note: "" })}>
        {sheet.advances.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2" data-testid={`advance-row-${idx}`}>
            <Input placeholder="Staff name" value={row.staff_name} onChange={(e) => updateArrayItem("advances", idx, { staff_name: e.target.value })} className="flex-1" />
            <Input type="number" placeholder="Amount" value={row.amount} onChange={(e) => updateArrayItem("advances", idx, { amount: parseFloat(e.target.value) || 0 })} className="w-28 font-money" />
            <Button variant="ghost" size="icon" onClick={() => removeRow("advances", idx)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </Section>

      <Section title="Dues Collected" testId="daily-sheet-dues-section" onAdd={() => addRow("dues_collected", { party: "", amount: 0, note: "" })}>
        {sheet.dues_collected.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2" data-testid={`due-row-${idx}`}>
            <Input placeholder="Party" value={row.party} onChange={(e) => updateArrayItem("dues_collected", idx, { party: e.target.value })} className="flex-1" />
            <Input type="number" placeholder="Amount" value={row.amount} onChange={(e) => updateArrayItem("dues_collected", idx, { amount: parseFloat(e.target.value) || 0 })} className="w-28 font-money" />
            <Button variant="ghost" size="icon" onClick={() => removeRow("dues_collected", idx)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </Section>

      <div className="flex items-center justify-between">
        {sheet.id && <Badge variant="secondary">Editing saved sheet — re-saving replaces previously routed entries</Badge>}
        <Button data-testid="daily-sheet-save-button" onClick={handleSave} disabled={saving} className="ml-auto">
          {saving ? "Saving…" : sheet.id ? "Update Sheet" : "Save Sheet"}
        </Button>
      </div>
    </div>
  );
}
