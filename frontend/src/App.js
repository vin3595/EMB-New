import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "./components/ui/toaster";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Bills from "./pages/Bills";
import DailySheet from "./pages/DailySheet";
import DailySheetHistory from "./pages/DailySheetHistory";
import Vouchers from "./pages/Vouchers";
import Staff from "./pages/Staff";
import Items from "./pages/Items";
import Invoices from "./pages/Invoices";
import SettingsPage from "./pages/Settings";
import Admin from "./pages/Admin";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/daily-sheet" element={<DailySheet />} />
        <Route path="/daily-sheet/history" element={<DailySheetHistory />} />
        <Route path="/vouchers" element={<Vouchers />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/items" element={<Items />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
