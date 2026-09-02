import { PackageSearch } from "lucide-react";
import type { IntegrationDefinition } from "@/lib/integrations/types";
import { IntegrationCard } from "./integration-card";

export function IntegrationsGrid({ integrations }: { integrations: IntegrationDefinition[] }) {
  if (integrations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <PackageSearch className="size-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Ninguna integración coincide con tu búsqueda.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {integrations.map((integration) => (
        <IntegrationCard key={integration.id} integration={integration} />
      ))}
    </div>
  );
}
