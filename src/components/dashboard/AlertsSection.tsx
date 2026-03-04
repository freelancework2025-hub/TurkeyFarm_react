import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface Alert {
  id: string;
  message: string;
  severity: "critical" | "warning" | "info";
}

interface AlertsSectionProps {
  alerts: Alert[];
  className?: string;
}

const SEVERITY_STYLES = {
  critical: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300",
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
};

export function AlertsSection({ alerts, className }: AlertsSectionProps) {
  const [open, setOpen] = useState(alerts.length > 0);

  if (alerts.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4 shadow-sm",
          className
        )}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-foreground">
              Alertes critiques ({alerts.length})
            </span>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  SEVERITY_STYLES[alert.severity]
                )}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {alert.message}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
