import React from "react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "../../contexts/ThemeContext";

export function Toaster(props) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "group toast bg-card text-card-foreground border border-border shadow-lg rounded-lg font-sans",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-secondary text-secondary-foreground",
          success: "!bg-success !text-success-foreground !border-success",
          error: "!bg-destructive !text-destructive-foreground !border-destructive",
          warning: "!bg-warning !text-warning-foreground !border-warning",
        },
      }}
      {...props}
    />
  );
}
