"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { IntegrationCategory } from "@/lib/integrations/types";

export type IntegrationTab = "all" | "connected" | IntegrationCategory;

const CATEGORY_TABS: { value: IntegrationTab; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "messaging", label: "Mensajería" },
  { value: "scheduling", label: "Agenda" },
  { value: "ads", label: "Ads" },
  { value: "connected", label: "Conectadas" },
];

export function IntegrationsHeader({
  search,
  onSearchChange,
  activeTab,
  onTabChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  activeTab: IntegrationTab;
  onTabChange: (value: IntegrationTab) => void;
}) {
  return (
    <header className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Integraciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecta Sistema LIA con las herramientas que ya usa tu centro estético.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as IntegrationTab)}>
          <TabsList variant="line" className="max-w-full overflow-x-auto">
            {CATEGORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar integración..."
            className="pl-8"
            aria-label="Buscar integración"
          />
        </div>
      </div>
    </header>
  );
}
