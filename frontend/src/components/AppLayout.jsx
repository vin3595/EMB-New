import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ScanLine,
  BookOpenText,
  Receipt,
  Users,
  Package,
  FileText,
  Settings as SettingsIcon,
  Moon,
  Sun,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/bills", label: "Bills", icon: ScanLine, testId: "nav-bills" },
  { to: "/daily-sheet", label: "Daily Sheet", icon: BookOpenText, testId: "nav-daily-sheet" },
  { to: "/vouchers", label: "Vouchers", icon: Receipt, testId: "nav-vouchers" },
  { to: "/staff", label: "Staff", icon: Users, testId: "nav-staff" },
  { to: "/items", label: "Items & Recipes", icon: Package, testId: "nav-items" },
  { to: "/invoices", label: "Invoices", icon: FileText, testId: "nav-invoices" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-5 border-b border-border">
          <h1 className="font-display text-xl font-semibold text-primary">EaseMyBill</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Bill scan → Tally, done right</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, testId }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testId}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-secondary"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              data-testid="nav-admin"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-secondary"
                )
              }
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </NavLink>
          )}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between px-2">
            <div className="text-xs">
              <p className="font-medium truncate max-w-[140px]">{user?.name}</p>
              <p className="text-muted-foreground truncate max-w-[140px]">{user?.email}</p>
            </div>
            <Button data-testid="theme-toggle-button" variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
          <Button data-testid="logout-button" variant="outline" className="w-full" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
