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

export type SalonRolePermissions = {
  admin?: { clients_access?: boolean };
  reception?: {
    pages?: Partial<Record<"bookings" | "clients" | "schedule" | "analytics", boolean>>;
  };
};

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

const RECEPTION_PAGE_BY_RESOURCE: Partial<Record<Resource, "bookings" | "clients" | "schedule" | "analytics">> = {
  bookings: "bookings",
  clients: "clients",
  schedule: "schedule",
  statistics: "analytics",
};

export type PermUser = {
  role: UserRole;
  effective_permissions?: Record<string, boolean> | null;
  salon_role_permissions?: SalonRolePermissions | null;
};

function adminClientsAllowed(user: PermUser): boolean {
  return user.salon_role_permissions?.admin?.clients_access !== false;
}

function receptionPageAllowed(user: PermUser, page: "bookings" | "clients" | "schedule" | "analytics"): boolean {
  return user.salon_role_permissions?.reception?.pages?.[page] !== false;
}

function allowedResources(role: UserRole): Set<Resource> {
  switch (role) {
    case "owner":
      return new Set<Resource>([...SALON_ADMIN, "users", "settings", "audit"]);
    case "admin":
      // Admin: всё кроме /users; settings/audit доступны
      return new Set<Resource>([...SALON_ADMIN, "settings", "audit"]);
    case "reception":
      return new Set<Resource>([
        "dashboard",
        "bookings",
        "clients",
        "schedule",
        "statistics",
        "chats",
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

export function can(user: PermUser, action: Action, resource: Resource): boolean {
  const set = allowedResources(user.role);
  if (!set.has(resource)) return false;

  if (action === "manage") {
    return (
      user.role === "owner" &&
      (resource === "users" || resource === "settings" || resource === "audit")
    );
  }

  // /users — только owner. /settings и /audit — owner + admin.
  if (resource === "users") {
    return user.role === "owner";
  }
  if (resource === "settings" || resource === "audit") {
    return user.role === "owner" || user.role === "admin";
  }

  if (action === "delete" && user.role === "reception") {
    if (resource === "clients" || resource === "bookings") return false;
  }

  // Master: page-level resources are gated by page_* permissions set by the owner.
  if (user.role === "master") {
    const pagePermKey = MASTER_PAGE_PERM_MAP[resource];
    if (pagePermKey !== undefined) {
      return user.effective_permissions?.[pagePermKey] ?? false;
    }
    // master_dashboard is always allowed for master
    return true;
  }

  if (user.role === "admin" && resource === "clients") {
    if (!adminClientsAllowed(user)) return false;
  }

  if (user.role === "reception") {
    const pageKey = RECEPTION_PAGE_BY_RESOURCE[resource];
    if (pageKey) {
      if (!receptionPageAllowed(user, pageKey)) return false;
    }
  }

  // Non-master: check granular permission if available and mapped
  if (user.effective_permissions) {
    const permKey = RESOURCE_PERM_MAP[resource];
    if (permKey !== undefined && !(user.role === "reception" && resource === "statistics")) {
      return user.effective_permissions[permKey] ?? false;
    }
  }

  return true;
}
