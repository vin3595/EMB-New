import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { formatDateIST } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { LoadingRows, ErrorState, EmptyState } from "../components/StateViews";

export default function Admin() {
  const [tenants, setTenants] = useState([]);
  const [status, setStatus] = useState("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get("/admin/tenants");
      setTenants(res.data.tenants);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Admin — Tenants</h1>
        <p className="text-sm text-muted-foreground">Out-of-band view across every isolated tenant.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>All Tenants</CardTitle></CardHeader>
        <CardContent>
          {status === "loading" && <LoadingRows testId="admin-loading" />}
          {status === "error" && <ErrorState message="Could not load tenants." onRetry={load} testId="admin-error" />}
          {status === "ready" && tenants.length === 0 && <EmptyState testId="admin-empty" title="No tenants yet" />}
          {status === "ready" && tenants.length > 0 && (
            <Table data-testid="admin-tenants-table">
              <TableHeader>
                <TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Bills</TableHead><TableHead>Daily Sheets</TableHead><TableHead>Vouchers</TableHead><TableHead>Joined</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id} data-testid={`admin-tenant-row-${t.id}`}>
                    <TableCell className="font-medium">{t.email}</TableCell>
                    <TableCell><Badge variant={t.role === "admin" ? "default" : "secondary"}>{t.role}</Badge></TableCell>
                    <TableCell>{t.bills_count}</TableCell>
                    <TableCell>{t.daily_sheets_count}</TableCell>
                    <TableCell>{t.vouchers_count}</TableCell>
                    <TableCell>{formatDateIST(t.created_at)}</TableCell>
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
