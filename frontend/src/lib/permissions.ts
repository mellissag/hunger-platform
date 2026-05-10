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
  | "master_dashboard"
  | "master_schedule"
  | "master_clients"
  | "master_bookings"
  | "master_stats"
  | "master_profile";

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

const RECEPTION_READ_EXTRA: Resource[] = ["services"];

const MASTER: Resource[] = [
  "master_dashboard",
  "master_schedule",
  "master_clients",
  "master_bookings",
  "master_stats",
  "master_profile",
];

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
        ...RECEPTION_READ_EXTRA,
      ]);
    case "master":
      return new Set<Resource>(MASTER);
    default:
      return new Set();
  }
}

/** Maps a sidebar resource to the granular permission key that controls its visibility. */
const RESOURCE_PERM_MAP: Partial<Record<Resource, string>> = {
  broadcasts: "broadcasts_view",
  inventory: "inventory_view",
  formulas: "formulas_view",
  statistics: "stats_salon",
  audit: "audit_view",
  ai: "ai_manage",
};

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

  // Check granular permission if available and mapped
  if (user.effective_permissions) {
    const permKey = RESOURCE_PERM_MAP[resource];
    if (permKey !== undefined) {
      return user.effective_permissions[permKey] ?? false;
    }
  }

  return true;
}
