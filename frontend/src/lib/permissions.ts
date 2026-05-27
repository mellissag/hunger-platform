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
  | "reports"
  | "ai"
  | "blacklist"
  | "users"
  | "settings"
  | "audit"
  | "inventory"
  | "formulas"
  | "master_dashboard";

export type Action = "read" | "create" | "update" | "delete" | "manage";

export type PagePermissions = Record<string, Record<string, boolean> | undefined> | null | undefined;

function pget(p: PagePermissions, section: string, key: string): boolean {
  if (!p) return false;
  const s = p[section];
  if (!s || typeof s !== "object") return false;
  if (key !== "enabled" && !s.enabled) return false;
  return Boolean(s[key]);
}

const SECTION: Partial<Record<Resource, string>> = {
  bookings: "bookings",
  clients: "clients",
  masters: "specialists",
  services: "services",
  schedule: "schedule",
  broadcasts: "broadcasts",
  chats: "chats",
  statistics: "analytics",
  ai: "ai",
  blacklist: "blacklist",
  users: "staff",
  settings: "settings",
  audit: "audit_log",
  inventory: "inventory",
  formulas: "formulas",
  master_dashboard: "master_dashboard",
};

export type PermUser = {
  role: UserRole;
  effective_permissions?: Record<string, boolean> | null;
  page_permissions?: PagePermissions;
  reports_access?: boolean;
};

export function can(user: PermUser, action: Action, resource: Resource): boolean {
  if (user.role === "owner") {
    if (action === "manage") {
      return resource === "users" || resource === "settings" || resource === "audit";
    }
    if (resource === "master_dashboard") return false;
    if (resource === "users") return true;
    return true;
  }

  const p = user.page_permissions;

  if (resource === "dashboard") {
    return user.role === "admin" || user.role === "reception";
  }

  if (resource === "master_dashboard") {
    return user.role === "master" && pget(p, "master_dashboard", "enabled");
  }

  const sec = SECTION[resource];
  if (!sec) return false;

  if (resource === "users") {
    if (action === "read") {
      return pget(p, "staff", "enabled") && pget(p, "staff", "view_list");
    }
    if (action === "create") {
      return pget(p, "staff", "create");
    }
    if (action === "manage") {
      return pget(p, "staff", "manage_permissions");
    }
    return false;
  }

  if (action === "read") {
    return pget(p, sec, "enabled");
  }

  if (action === "manage") {
    if (resource === "settings" || resource === "audit") {
      return user.role === "admin" && pget(p, sec, "enabled");
    }
    if (resource === "ai") {
      return pget(p, "ai", "manage_settings");
    }
    return false;
  }

  if (resource === "settings") {
    if (action === "update") return pget(p, "settings", "edit");
    return pget(p, "settings", "enabled");
  }

  if (resource === "audit") {
    return false;
  }

  if (resource === "clients") {
    if (action === "create") return pget(p, "clients", "create");
    if (action === "update") return pget(p, "clients", "edit");
    if (action === "delete") return pget(p, "clients", "delete");
    return pget(p, "clients", "enabled");
  }

  if (resource === "bookings") {
    if (action === "create") return pget(p, "bookings", "create");
    if (action === "update") return pget(p, "bookings", "edit");
    if (action === "delete") return pget(p, "bookings", "cancel");
    return pget(p, "bookings", "enabled");
  }

  if (resource === "broadcasts") {
    if (action === "create") return pget(p, "broadcasts", "create");
    if (action === "update" || action === "delete") return pget(p, "broadcasts", "send");
    return pget(p, "broadcasts", "enabled");
  }

  if (resource === "inventory") {
    if (action === "update" || action === "create" || action === "delete") {
      return pget(p, "inventory", "edit_stock") || pget(p, "inventory", "manage_items");
    }
    return pget(p, "inventory", "enabled");
  }

  if (resource === "formulas") {
    if (action === "create") return pget(p, "formulas", "create");
    if (action === "update") return pget(p, "formulas", "edit");
    if (action === "delete") return pget(p, "formulas", "delete");
    return pget(p, "formulas", "enabled");
  }

  if (resource === "services") {
    if (pget(p, "services", "view_only")) return false;
    if (action === "delete") return pget(p, "services", "delete");
    return pget(p, "services", "create_edit");
  }

  if (resource === "masters") {
    if (pget(p, "specialists", "view_only")) return false;
    return pget(p, "specialists", "edit_profiles");
  }

  if (resource === "schedule") {
    if (action === "update") {
      return pget(p, "schedule", "edit_own") || pget(p, "schedule", "edit_others");
    }
    return pget(p, "schedule", "enabled");
  }

  if (resource === "statistics") {
    return pget(p, "analytics", "enabled");
  }

  if (resource === "reports") {
    if (user.role === "admin") return Boolean(user.reports_access);
    return false;
  }

  if (resource === "chats") {
    if (action === "create" || action === "update") return pget(p, "chats", "reply");
    return pget(p, "chats", "enabled");
  }

  if (resource === "ai") {
    return pget(p, "ai", "enabled");
  }

  if (resource === "blacklist") {
    if (action === "create") return pget(p, "blacklist", "add");
    if (action === "delete") return pget(p, "blacklist", "remove");
    if (action === "update" && pget(p, "blacklist", "view_only")) return false;
    return pget(p, "blacklist", "enabled");
  }

  return pget(p, sec, "enabled");
}

export function canExportClients(user: PermUser): boolean {
  if (user.role === "owner") return true;
  return pget(user.page_permissions, "clients", "export");
}
