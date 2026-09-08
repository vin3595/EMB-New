import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, Package, Receipt, TrendingUp } from "lucide-react";
import api from "../lib/api";
import { formatINR, formatDateIST } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { LoadingRows, ErrorState, EmptyState } from "../components/StateViews";

function StatCard({ icon: Icon, label, value, testId, tone = "default" }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`font-money text-2xl font-semibold mt-1 ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</p>
        </div>
        <div className="rounded-full bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/dashboard");
      setData(res.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") return <LoadingRows rows={6} testId="dashboard-loading" />;
  if (status === "error") return <ErrorState message="Could not load dashboard." onRetry={load} testId="dashboard-error" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Today's snapshot.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard testId="stat-todays-cash-out" icon={Banknote} label="Today's Cash Out" value={formatINR(data.todays_cash_out)} />
        <StatCard testId="stat-expenses-ytd" icon={TrendingUp} label="Expenses YTD" value={formatINR(data.expenses_ytd)} />
        <StatCard testId="stat-reorders" icon={Package} label="Upcoming Reorders" value={data.upcoming_reorders.length} />
        <StatCard testId="stat-40a3-ytd" icon={AlertTriangle} label="40A(3) Disallowed YTD" value={formatINR(data.section_40a3_ytd_disallowed)} tone="destructive" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="top-vendors-card">
          <CardHeader>
            <CardTitle className="text-base">Top Vendors</CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_vendors.length === 0 ? (
              <EmptyState testId="top-vendors-empty" title="No bills yet" />
            ) : (
              <ul className="space-y-2">
                {data.top_vendors.map((v) => (
                  <li key={v.vendor} className="flex justify-between text-sm">
                    <span>{v.vendor}</span>
                    <span className="font-money">{formatINR(v.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-testid="top-categories-card">
          <CardHeader>
            <CardTitle className="text-base">Top Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_categories.length === 0 ? (
              <EmptyState testId="top-categories-empty" title="No expenses yet" />
            ) : (
              <ul className="space-y-2">
                {data.top_categories.map((c) => (
                  <li key={c.category} className="flex justify-between text-sm">
                    <span>{c.category}</span>
                    <span className="font-money">{formatINR(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-testid="recent-bills-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Recent Bills
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_bills.length === 0 ? (
              <EmptyState testId="recent-bills-empty" title="No bills yet" />
            ) : (
              <ul className="space-y-2">
                {data.recent_bills.map((b) => (
                  <li key={b.id} className="flex justify-between text-sm">
                    <span>
                      {b.vendor} <span className="text-muted-foreground">· {formatDateIST(b.bill_date)}</span>
                    </span>
                    <span className="font-money">{formatINR(b.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-testid="upcoming-reorders-card">
          <CardHeader>
            <CardTitle className="text-base">Upcoming Reorders</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming_reorders.length === 0 ? (
              <EmptyState testId="upcoming-reorders-empty" title="Stock levels look healthy" />
            ) : (
              <ul className="space-y-2">
                {data.upcoming_reorders.map((i) => (
                  <li key={i.id} className="flex justify-between text-sm">
                    <span>{i.name}</span>
                    <Badge variant="warning">{i.current_stock} {i.unit} left</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
