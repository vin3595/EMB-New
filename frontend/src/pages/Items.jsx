import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Upload } from "lucide-react";
import api from "../lib/api";
import { formatINR } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { LoadingRows, EmptyState, ErrorState } from "../components/StateViews";

function AddItemDialog({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "pcs", hsn: "", reorder_level: "" });

  const handleSave = async () => {
    if (!form.name) return toast.error("Name is required");
    try {
      await api.post("/items", { ...form, reorder_level: form.reorder_level === "" ? null : parseFloat(form.reorder_level) });
      toast.success("Item added");
      setOpen(false);
      setForm({ name: "", unit: "pcs", hsn: "", reorder_level: "" });
      onAdded();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not add item");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-item-button"><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input data-testid="item-name-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Unit</Label><Input data-testid="item-unit-input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></div>
          <div><Label>HSN</Label><Input data-testid="item-hsn-input" value={form.hsn} onChange={(e) => setForm((f) => ({ ...f, hsn: e.target.value }))} /></div>
          <div><Label>Reorder Level</Label><Input data-testid="item-reorder-input" type="number" value={form.reorder_level} onChange={(e) => setForm((f) => ({ ...f, reorder_level: e.target.value }))} className="font-money" /></div>
        </div>
        <DialogFooter><Button data-testid="item-save-button" onClick={handleSave}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemsTab() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/items");
      setItems(res.data.items);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePetpoojaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/recipes/petpooja-sync", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Synced: ${res.data.created} created, ${res.data.updated} updated`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not sync Petpooja export");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Item Master</CardTitle>
        <div className="flex gap-2">
          <Button data-testid="petpooja-sync-button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Petpooja Sync
          </Button>
          <input ref={fileInputRef} data-testid="petpooja-file-input" type="file" accept=".xlsx" className="hidden" onChange={handlePetpoojaUpload} />
          <AddItemDialog onAdded={load} />
        </div>
      </CardHeader>
      <CardContent>
        {status === "loading" && <LoadingRows testId="items-loading" />}
        {status === "error" && <ErrorState message="Could not load items." onRetry={load} testId="items-error" />}
        {status === "ready" && items.length === 0 && <EmptyState testId="items-empty" title="No items yet" description="Items are created automatically as you scan bills, or add them here." />}
        {status === "ready" && items.length > 0 && (
          <Table data-testid="items-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Last Price</TableHead>
                <TableHead>Reorder Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id} data-testid={`item-row-${i.id}`}>
                  <TableCell className="font-medium">{i.name} {i.is_prepped && <Badge variant="secondary" className="ml-1">Prepped</Badge>}</TableCell>
                  <TableCell>{i.unit}</TableCell>
                  <TableCell className={i.reorder_level != null && i.current_stock <= i.reorder_level ? "text-destructive font-semibold" : ""}>{i.current_stock}</TableCell>
                  <TableCell className="font-money">{i.last_unit_price != null ? formatINR(i.last_unit_price) : "—"}</TableCell>
                  <TableCell>{i.reorder_level ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecipesTab() {
  const [recipes, setRecipes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [form, setForm] = useState({ name: "", recipe_type: "menu", yield_quantity: 1, yield_unit: "pcs", sale_price: "", bom: [] });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [recipesRes, alertsRes, itemsRes] = await Promise.all([api.get("/recipes"), api.get("/recipes/margin-alerts"), api.get("/items")]);
      setRecipes(recipesRes.data.recipes);
      setAlerts(alertsRes.data.alerts);
      setItems(itemsRes.data.items);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBomLine = () => setForm((f) => ({ ...f, bom: [...f.bom, { item_id: "", item_name: "", quantity: 1, unit: "pcs" }] }));
  const updateBomLine = (idx, patch) => setForm((f) => ({ ...f, bom: f.bom.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const handleSave = async () => {
    if (!form.name) return toast.error("Name is required");
    try {
      await api.post("/recipes", { ...form, sale_price: form.sale_price === "" ? null : parseFloat(form.sale_price) });
      toast.success("Recipe saved");
      setOpen(false);
      setForm({ name: "", recipe_type: "menu", yield_quantity: 1, yield_unit: "pcs", sale_price: "", bom: [] });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save recipe");
    }
  };

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <Card data-testid="margin-alerts-card" className="border-destructive/40">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Margin Alerts</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {alerts.map((a) => (
                <li key={a.recipe_id}>{a.recipe_name}: cost {formatINR(a.cost)} is {(a.cost_ratio * 100).toFixed(0)}% of sale price {formatINR(a.sale_price)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recipes</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-recipe-button"><Plus className="h-4 w-4 mr-2" /> Add Recipe</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add Recipe</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input data-testid="recipe-name-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.recipe_type} onValueChange={(v) => setForm((f) => ({ ...f, recipe_type: v }))}>
                    <SelectTrigger data-testid="recipe-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="menu">Menu (finished dish)</SelectItem>
                      <SelectItem value="prep">Prep (intermediate)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Yield Qty</Label><Input data-testid="recipe-yield-qty-input" type="number" value={form.yield_quantity} onChange={(e) => setForm((f) => ({ ...f, yield_quantity: parseFloat(e.target.value) || 1 }))} /></div>
                  <div><Label>Yield Unit</Label><Input data-testid="recipe-yield-unit-input" value={form.yield_unit} onChange={(e) => setForm((f) => ({ ...f, yield_unit: e.target.value }))} /></div>
                  {form.recipe_type === "menu" && (
                    <div><Label>Sale Price</Label><Input data-testid="recipe-sale-price-input" type="number" value={form.sale_price} onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))} className="font-money" /></div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between"><Label>BOM (ingredients)</Label>
                    <Button data-testid="recipe-add-bom-line" variant="outline" size="sm" onClick={addBomLine}><Plus className="h-3 w-3 mr-1" /> Add ingredient</Button>
                  </div>
                  {form.bom.map((line, idx) => (
                    <div key={idx} className="flex gap-2 mt-2" data-testid={`recipe-bom-row-${idx}`}>
                      <Select value={line.item_id} onValueChange={(v) => { const item = items.find((i) => i.id === v); updateBomLine(idx, { item_id: v, item_name: item?.name || "", unit: item?.unit || "pcs" }); }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                        <SelectContent>
                          {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" value={line.quantity} onChange={(e) => updateBomLine(idx, { quantity: parseFloat(e.target.value) || 0 })} className="w-24" placeholder="Qty" />
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter><Button data-testid="recipe-save-button" onClick={handleSave}>Save Recipe</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {status === "loading" && <LoadingRows testId="recipes-loading" />}
          {status === "error" && <ErrorState message="Could not load recipes." onRetry={load} testId="recipes-error" />}
          {status === "ready" && recipes.length === 0 && <EmptyState testId="recipes-empty" title="No recipes yet" />}
          {status === "ready" && recipes.length > 0 && (
            <Table data-testid="recipes-table">
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Yield</TableHead><TableHead>Ingredients</TableHead></TableRow></TableHeader>
              <TableBody>
                {recipes.map((r) => (
                  <TableRow key={r.id} data-testid={`recipe-row-${r.id}`}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><Badge variant="secondary">{r.recipe_type}</Badge></TableCell>
                    <TableCell>{r.yield_quantity} {r.yield_unit}</TableCell>
                    <TableCell>{r.bom.length}</TableCell>
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

function ProductionTab() {
  const [recipes, setRecipes] = useState([]);
  const [lots, setLots] = useState([]);
  const [status, setStatus] = useState("loading");
  const [form, setForm] = useState({ recipe_id: "", lot_size: 1 });
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [recipesRes, lotsRes] = await Promise.all([api.get("/recipes", { params: { recipe_type: "menu" } }), api.get("/production/lots")]);
      setRecipes(recipesRes.data.recipes);
      setLots(lotsRes.data.lots);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    if (!form.recipe_id) return toast.error("Pick a recipe");
    setRunning(true);
    try {
      const res = await api.post("/production/run", form);
      toast.success(`Lot ${res.data.lot.lot_number} produced`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Production run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Run Production</CardTitle></CardHeader>
        <CardContent className="flex gap-3 items-end">
          <div className="flex-1">
            <Label>Recipe</Label>
            <Select value={form.recipe_id} onValueChange={(v) => setForm((f) => ({ ...f, recipe_id: v }))}>
              <SelectTrigger data-testid="production-recipe-select"><SelectValue placeholder="Choose a finished-good recipe" /></SelectTrigger>
              <SelectContent>{recipes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Lot Size</Label>
            <Input data-testid="production-lot-size-input" type="number" value={form.lot_size} onChange={(e) => setForm((f) => ({ ...f, lot_size: parseFloat(e.target.value) || 1 }))} className="w-28" />
          </div>
          <Button data-testid="production-run-button" onClick={handleRun} disabled={running}>{running ? "Running…" : "Run"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Production Lots</CardTitle></CardHeader>
        <CardContent>
          {status === "ready" && lots.length === 0 && <EmptyState testId="production-lots-empty" title="No lots produced yet" />}
          {status === "ready" && lots.length > 0 && (
            <Table data-testid="production-lots-table">
              <TableHeader><TableRow><TableHead>Lot #</TableHead><TableHead>Recipe</TableHead><TableHead>Qty</TableHead><TableHead>Cost</TableHead></TableRow></TableHeader>
              <TableBody>
                {lots.map((l) => (
                  <TableRow key={l.id} data-testid={`production-lot-row-${l.id}`}>
                    <TableCell className="font-money">{l.lot_number}</TableCell>
                    <TableCell>{l.recipe_name}</TableCell>
                    <TableCell>{l.quantity_produced} {l.unit}</TableCell>
                    <TableCell className="font-money">{formatINR(l.total_cost)}</TableCell>
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

export default function Items() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Items & Recipes</h1>
        <p className="text-sm text-muted-foreground">Inventory, recipes, and production for QSR operations.</p>
      </div>
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger data-testid="items-tab-items" value="items">Items</TabsTrigger>
          <TabsTrigger data-testid="items-tab-recipes" value="recipes">Recipes</TabsTrigger>
          <TabsTrigger data-testid="items-tab-production" value="production">Production</TabsTrigger>
        </TabsList>
        <TabsContent value="items"><ItemsTab /></TabsContent>
        <TabsContent value="recipes"><RecipesTab /></TabsContent>
        <TabsContent value="production"><ProductionTab /></TabsContent>
      </Tabs>
    </div>
  );
}
