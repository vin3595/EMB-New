import React from "react";
import { Inbox, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function LoadingRows({ rows = 4, testId = "loading-state" }) {
  return (
    <div data-testid={testId} className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, testId = "empty-state" }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message = "Something went wrong.", onRetry, testId = "error-state" }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      {onRetry && (
        <Button data-testid="error-state-retry-button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
