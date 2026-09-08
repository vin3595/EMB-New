import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { ScanLine } from "lucide-react";

export default function Login() {
  const { user, loading, login } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/40 p-4">
      <Card className="w-full max-w-sm" data-testid="login-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ScanLine className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">EaseMyBill</CardTitle>
          <CardDescription>Scan vendor bills, track inventory, and generate CA-ready vouchers.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-testid="google-login-button" className="w-full" size="lg" onClick={login}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
