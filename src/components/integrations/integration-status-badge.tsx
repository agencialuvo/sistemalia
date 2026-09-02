import { AlertTriangle, Check, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus } from "@/lib/integrations/types";

const STATUS_CONFIG: Record<
  IntegrationStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  connected: {
    label: "Conectado",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: <Check className="size-3" />,
  },
  not_connected: {
    label: "No conectado",
    className: "border border-border text-muted-foreground",
    icon: null,
  },
  coming_soon: {
    label: "Próximamente",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: <Clock className="size-3" />,
  },
  error: {
    label: "Requiere atención",
    className: "bg-destructive/10 text-destructive",
    icon: <AlertTriangle className="size-3" />,
  },
};

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`shrink-0 gap-1 border-transparent ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
