/** Дефолты прав по роли (синхронно с backend `user_page_permissions.py`). */

export type SectionPerms = Record<string, boolean>;
export type PagePermissions = Record<string, SectionPerms>;

function admin(): PagePermissions {
  return {
    my_day: { enabled: false },
    bookings: {
      enabled: true,
      view_all: true,
      create: true,
      edit: true,
      cancel: true,
      view_client_contacts: true,
      view_calendar_booking_phones: true,
    },
    clients: {
      enabled: true,
      view_all: true,
      view_phones: true,
      export: true,
      create: true,
      edit: true,
      delete: false,
      view_history: true,
    },
    chats: { enabled: true, view_all: true, reply: true, view_history: true },
    schedule: { enabled: true, view_all: true, edit_own: true, edit_others: true },
    formulas: { enabled: true, view_all: true, create: true, edit: true, delete: true },
    analytics: { enabled: true, view_all: true, view_financial: true },
    broadcasts: { enabled: true, create: true, send: true, view_stats: true },
    services: { enabled: true, view_only: false, create_edit: true, delete: true },
    inventory: { enabled: true, view_only: false, edit_stock: true, manage_items: true },
    ai: { enabled: true, use_chat: true, manage_settings: true },
    blacklist: { enabled: true, view_only: false, add: true, remove: true },
    specialists: { enabled: true, view_only: false, edit_profiles: true },
    staff: { enabled: false, view_list: false, create: false, manage_permissions: false },
    settings: { enabled: true, view_only: false, edit: true },
    audit_log: { enabled: true },
  };
}

function master(): PagePermissions {
  return {
    my_day: { enabled: true },
    bookings: {
      enabled: true,
      view_all: false,
      create: true,
      edit: true,
      cancel: true,
      view_client_contacts: true,
      view_calendar_booking_phones: false,
    },
    clients: {
      enabled: true,
      view_all: false,
      view_phones: false,
      export: false,
      create: false,
      edit: false,
      delete: false,
      view_history: true,
    },
    chats: { enabled: true, view_all: false, reply: true, view_history: true },
    schedule: { enabled: true, view_all: false, edit_own: true, edit_others: false },
    formulas: { enabled: true, view_all: false, create: true, edit: true, delete: false },
    analytics: { enabled: true, view_all: false, view_financial: false },
    broadcasts: { enabled: false, create: false, send: false, view_stats: false },
    services: { enabled: false, view_only: true, create_edit: false, delete: false },
    inventory: { enabled: false, view_only: false, edit_stock: false, manage_items: false },
    ai: { enabled: false, use_chat: false, manage_settings: false },
    blacklist: { enabled: false, view_only: false, add: false, remove: false },
    specialists: { enabled: false, view_only: false, edit_profiles: false },
    staff: { enabled: false, view_list: false, create: false, manage_permissions: false },
    settings: { enabled: false, view_only: false, edit: false },
    audit_log: { enabled: false },
  };
}

function reception(): PagePermissions {
  return {
    my_day: { enabled: false },
    bookings: {
      enabled: true,
      view_all: true,
      create: true,
      edit: true,
      cancel: true,
      view_client_contacts: true,
      view_calendar_booking_phones: true,
    },
    clients: {
      enabled: true,
      view_all: true,
      view_phones: true,
      export: false,
      create: true,
      edit: true,
      delete: false,
      view_history: true,
    },
    chats: { enabled: true, view_all: true, reply: true, view_history: true },
    schedule: { enabled: true, view_all: true, edit_own: true, edit_others: false },
    formulas: { enabled: true, view_all: true, create: false, edit: false, delete: false },
    analytics: { enabled: false, view_all: false, view_financial: false },
    broadcasts: { enabled: false, create: false, send: false, view_stats: false },
    services: { enabled: false, view_only: true, create_edit: false, delete: false },
    inventory: { enabled: false, view_only: false, edit_stock: false, manage_items: false },
    ai: { enabled: false, use_chat: false, manage_settings: false },
    blacklist: { enabled: true, view_only: false, add: true, remove: true },
    specialists: { enabled: false, view_only: false, edit_profiles: false },
    staff: { enabled: false, view_list: false, create: false, manage_permissions: false },
    settings: { enabled: false, view_only: false, edit: false },
    audit_log: { enabled: false },
  };
}

function allTrue(node: SectionPerms | PagePermissions): SectionPerms | PagePermissions {
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "boolean") out[k] = true;
    else if (typeof v === "object" && v !== null) out[k] = allTrue(v as PagePermissions);
  }
  return out as PagePermissions;
}

export function defaultPermissionsForRole(role: string): PagePermissions {
  if (role === "owner") return allTrue(admin()) as PagePermissions;
  if (role === "admin") return structuredClone(admin());
  if (role === "reception") return structuredClone(reception());
  if (role === "master") return structuredClone(master());
  return structuredClone(master());
}

export function deepMergePermissions(base: PagePermissions, over: Partial<PagePermissions>): PagePermissions {
  const out: PagePermissions = structuredClone(base);
  for (const [sk, sv] of Object.entries(over)) {
    if (sv && typeof sv === "object" && !Array.isArray(sv)) {
      out[sk] = { ...(out[sk] ?? {}), ...sv };
    }
  }
  return out;
}
