import type { UserRole } from "@/types/user";

/** Coarse resources for UI gating (API enforces real RBAC). */
export type Resource =
  | "dashboard"
  | "bookings"
  | "clients"
  | "masters"
  | "services"
  | "schedule"
  | "broadcasts"
  | "chats"
  | "statistics"
  | "ai"
  | "blacklist"
  | "users"
  | "settings"
  | "audit"
  | "inventory"
  | "formulas"
  | "master_dashboard";

export type Action = "read" | "create" | "update" | "delete" | "manage";

const SALON_ADMIN: Resource[] = [
  "dashboard",
  "bookings",
  "clients",
  "masters",
  "services",
  "schedule",
  "broadcasts",
  "chats",
  "statistics",
  "ai",
  "blacklist",
  "inventory",
  "formulas",
];

/** Page-level resources a master can access when the owner grants the matching page_* permission. */
const MASTER_PAGE_RESOURCES: Resource[] = [
  "bookings",
  "clients",
  "schedule",
  "statistics",
  "masters",
  "inventory",
  "formulas",
  "chats",
];

/** Maps page-level resource → page_* permission key (only used for master role). */
const MASTER_PAGE_PERM_MAP: Partial<Record<Resource, string>> = {
  bookings: "page_bookings",
  clients: "page_clients",
  schedule: "page_schedule",
  statistics: "page_statistics",
  masters: "page_masters",
  inventory: "page_inventory",
  formulas: "page_formulas",
  chats: "page_chats",
};

/** Maps a sidebar resource to the granular permission key that controls its visibility (non-master roles). */
const RESOURCE_PERM_MAP: Partial<Record<Resource, string>> = {
  broadcasts: "broadcasts_view",
  inventory: "inventory_view",
  formulas: "formulas_view",
  statistics: "stats_salon",
  audit: "audit_view",
  ai: "ai_manage",
};

function allowedResources(role: UserRole): Set<Resource> {
  switch (role) {
    case "owner":
      return new Set<Resource>([...SALON_ADMIN, "users", "settings", "audit"]);
    case "admin":
      return new Set<Resource>(SALON_ADMIN);
    case "reception":
      return new Set<Resource>([
        "dashboard",
        "bookings",
        "clients",
        "schedule",
        "services",
      ]);
    case "master":
      return new Set<Resource>([
        "master_dashboard",
        ...MASTER_PAGE_RESOURCES,
      ]);
    default:
      return new Set();
  }
}

export function can(
  user: { role: UserRole; effective_permissions?: Record<string, boolean> | null },
  action: Action,
  resource: Resource,
): boolean {
  const set = allowedResources(user.role);
  if (!set.has(resource)) return false;

  if (action === "manage") {
    return (
      user.role === "owner" &&
      (resource === "users" || resource === "settings" || resource === "audit")
    );
  }

  if (resource === "users" || resource === "settings" || resource === "audit") {
    return user.role === "owner";
  }

  if (action === "delete" && user.role === "reception") {
    if (resource === "clients" || resource === "bookings") return false;
  }

  // Master: page-level resources are gated by page_* permissions set by the owner.
  // Default to false so no flash of hidden items before permissions load.
  if (user.role === "master") {
    const pagePermKey = MASTER_PAGE_PERM_MAP[resource];
    if (pagePermKey !== undefined) {
      return user.effective_permissions?.[pagePermKey] ?? false;
    }
    // master_dashboard is always allowed for master
    return true;
  }

  // Non-master: check granular permission if available and mapped
  if (user.effective_permissions) {
    const permKey = RESOURCE_PERM_MAP[resource];
    if (permKey !== undefined) {
      return user.effective_permissions[permKey] ?? false;
    }
  }

  return true;
}
