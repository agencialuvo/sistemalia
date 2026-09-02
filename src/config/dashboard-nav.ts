import {
  BarChart3,
  Bell,
  Blocks,
  Bot,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  GitMerge,
  Images,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Package,
  Percent,
  Radio,
  Settings,
  ShoppingCart,
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
      { href: "/bandeja-entrada", labelKey: "unifiedInbox", icon: Inbox },
      { href: "/notificaciones", labelKey: "notifications", icon: Bell },
      { href: "/medios", labelKey: "media", icon: Images },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/servicios", labelKey: "services", icon: ConciergeBell },
      { href: "/personal", labelKey: "staff", icon: Stethoscope },
      { href: "/pacientes", labelKey: "patients", icon: Users },
      { href: "/agenda", labelKey: "agenda", icon: CalendarDays },
      { href: "/inventario", labelKey: "inventory", icon: Package },
      { href: "/ventas", labelKey: "sales", icon: ShoppingCart },
    ],
  },
  {
    labelKey: "marketing",
    items: [
      { href: "/campanas", labelKey: "campaigns", icon: Megaphone, upcoming: true },
      { href: "/marketing/prospectos", labelKey: "leads", icon: Target },
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
      { href: "/metodos-pago", labelKey: "paymentMethods", icon: CreditCard },
      { href: "/plantillas-clinicas", labelKey: "clinicalTemplates", icon: ClipboardList },
      { href: "/integraciones", labelKey: "integrations", icon: Blocks },
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
 * Automatizaciones. `/doctores` is the old placeholder for this same "staff"
 * section, superseded by /personal (Módulo 04). `/citas` and `/calendario`
 * are the two modules unified into `/agenda` — both now just redirect there
 * (see their page.tsx). `/prospectos` is the old top-level placeholder for
 * this same section, superseded by /marketing/prospectos (Feature 11) —
 * same redirect treatment. `/marketing/inbox` is the previous location of
 * the Inbox Unificado (Feature 12), moved to `/bandeja-entrada` under
 * Principal — redirects there. `/marketing/canales` (Feature 10) is now
 * folded into `/integraciones` (one single "conectar herramientas externas"
 * page instead of two) — redirects there. `/bandeja` is the LEGACY
 * Supabase-backed inbox inherited from wacrm (unrelated data model, still
 * linked from the dashboard activity feed / notifications / deal-form) — it
 * intentionally has NO sidebar entry anymore (superseded by
 * `/bandeja-entrada`) but is not deleted, since removing it would break
 * those other screens; it is not added here because it was never generated
 * from a NavItem to begin with. They all still resolve (and stay protected
 * by the /dashboard prefix) so existing links and bookmarks do not break.
 */
export const UNLISTED_ROUTES = [
  "/contactos",
  "/flujos",
  "/doctores",
  "/citas",
  "/calendario",
  "/prospectos",
  "/marketing/inbox",
  "/marketing/canales",
];
