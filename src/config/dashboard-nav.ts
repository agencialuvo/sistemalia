import {
  BarChart3,
  Bell,
  Blocks,
  Bot,
  CalendarDays,
  Calendar,
  CircleDollarSign,
  GitMerge,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Package,
  Percent,
  Radio,
  Settings,
  Stethoscope,
  Target,
  Users,
  ConciergeBell,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Sidebar information architecture — the five operational pillars of a centro
 * estético.
 *
 * Lives outside the Sidebar component so the route map is editable without
 * touching rendering logic, and so other surfaces (command palette, mobile nav,
 * breadcrumbs) can read the same source instead of redeclaring it.
 *
 * Routes are Spanish, top-level slugs (/reportes, /pacientes) — no /dashboard
 * prefix. The middleware protects everything that is not explicitly public, so
 * a section added here is gated the moment it exists, without touching the
 * middleware.
 */

export interface NavItem {
  href: string;
  /** Key under the `Sidebar` next-intl namespace. */
  labelKey: string;
  icon: LucideIcon;
  /** Renders a small "Beta" chip after the label. Cosmetic only. */
  beta?: boolean;
  /**
   * Section not built yet — it resolves to a "Próximamente" placeholder.
   * Rendered dimmer so the sidebar reads as a roadmap rather than a set of
   * dead links.
   */
  upcoming?: boolean;
}

export interface NavGroup {
  /** Key under the `Sidebar.groups` next-intl namespace. */
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "main",
    items: [
      { href: "/panel", labelKey: "dashboard", icon: LayoutDashboard },
      { href: "/bandeja", labelKey: "inbox", icon: Inbox },
      { href: "/notificaciones", labelKey: "notifications", icon: Bell },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/servicios", labelKey: "services", icon: ConciergeBell },
      { href: "/doctores", labelKey: "staff", icon: Stethoscope, upcoming: true },
      { href: "/pacientes", labelKey: "patients", icon: Users, upcoming: true },
      { href: "/citas", labelKey: "appointments", icon: CalendarDays, upcoming: true },
      { href: "/calendario", labelKey: "calendar", icon: Calendar, upcoming: true },
      { href: "/inventario", labelKey: "inventory", icon: Package, upcoming: true },
    ],
  },
  {
    labelKey: "marketing",
    items: [
      { href: "/campanas", labelKey: "campaigns", icon: Megaphone, upcoming: true },
      { href: "/prospectos", labelKey: "leads", icon: Target, upcoming: true },
      { href: "/pipelines", labelKey: "pipelines", icon: GitMerge },
      { href: "/difusiones", labelKey: "broadcasts", icon: Radio },
      { href: "/automatizaciones", labelKey: "automations", icon: Zap },
      { href: "/agente-ia", labelKey: "aiAgents", icon: Bot },
    ],
  },
  {
    labelKey: "analytics",
    items: [
      { href: "/reportes", labelKey: "reports", icon: BarChart3, upcoming: true },
      { href: "/finanzas", labelKey: "finance", icon: CircleDollarSign, upcoming: true },
      { href: "/comisiones", labelKey: "commissions", icon: Percent, upcoming: true },
    ],
  },
  {
    labelKey: "configuration",
    items: [
      { href: "/ajustes", labelKey: "settings", icon: Settings },
      { href: "/integraciones", labelKey: "integrations", icon: Blocks, upcoming: true },
    ],
  },
];

/** Flat view, for lookups by href (placeholder pages, breadcrumbs). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Routes that exist but are intentionally absent from the sidebar.
 *
 * `contacts` and `flows` are inherited wacrm screens the new IA does not
 * surface — Pacientes supersedes Contactos, and Flows is folded into
 * Automatizaciones. They still resolve (and stay protected by the /dashboard
 * prefix) so existing links and bookmarks do not break.
 */
export const UNLISTED_ROUTES = ["/contactos", "/flujos"];
