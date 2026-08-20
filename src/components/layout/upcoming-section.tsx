"use client";

import { useTranslations } from "next-intl";
import { NAV_ITEMS } from "@/config/dashboard-nav";

/**
 * Placeholder for a sidebar section whose module has not been built yet.
 *
 * Reads its title and icon from the nav config by href, so a section renders
 * correctly from the moment it is added to NAV_GROUPS — and there is no second
 * copy of the label to keep in sync with the sidebar.
 */
export function UpcomingSection({ href }: { href: string }) {
  const t = useTranslations("Sidebar");
  const tu = useTranslations("Upcoming");

  const item = NAV_ITEMS.find((navItem) => navItem.href === href);
  const Icon = item?.icon;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        {Icon && (
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Icon className="size-7 text-primary" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {item ? t(item.labelKey as string) : tu("fallbackTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{tu("description")}</p>
        </div>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("upcoming")}
        </span>
      </div>
    </div>
  );
}
