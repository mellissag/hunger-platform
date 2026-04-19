export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type UserMe = {
  id: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string | null;
  lang: string;
  is_active: boolean;
  master_id: string | null;
};

export type CalendarBooking = {
  kind: "booking";
  id: string;
  master_id: string;
  client_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  price: string;
};

export type CalendarResponse = {
  bookings: CalendarBooking[];
  slots: {
    id: string;
    master_id: string;
    slot_type: string;
    starts_at: string;
    ends_at: string;
    note: string | null;
  }[];
};

export type ClientOut = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  tg_username: string | null;
  lang: string;
  total_bookings: number;
  total_revenue: string;
  no_show_count: number;
  last_visit_at: string | null;
  tags: string[];
  joined_at: string;
};

export type MasterOut = {
  id: string;
  display_name: string;
  color_hex: string;
  rating_avg: string | null;
  rating_count: number;
  is_active: boolean;
};

export type ServiceOut = {
  id: string;
  category_id: string | null;
  name_i18n: Record<string, string>;
  duration_minutes: number;
  price: string;
  is_active: boolean;
};

export type ServiceCategoryOut = {
  id: string;
  name_i18n: Record<string, string>;
  icon: string | null;
  sort_order: number;
};

export type BookingOut = {
  id: string;
  client_id: string;
  master_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  price: string;
  notes: string | null;
};

export type ClientNoteOut = {
  id: string;
  client_id: string;
  author_user_id: string | null;
  author_display_name: string | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type AIConversationOut = {
  id: string;
  client_id: string;
  client_name: string | null;
  started_at: string;
  ended_at: string | null;
  lang: string | null;
  token_in: number;
  token_out: number;
  last_message_preview: string | null;
};

export type BroadcastOut = {
  id: string;
  title: string;
  message_i18n: Record<string, string>;
  segment: Record<string, unknown>;
  media_url: string | null;
  media_type: string | null;
  inline_keyboard: { rows: { text: string; url?: string; callback_data?: string }[][] } | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  stats: Record<string, unknown>;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type SegmentPreviewResponse = {
  count: number;
};

export type StatsOverviewResponse = {
  period: { from: string; to: string };
  kpi: Record<string, string | number>;
  revenue_trend: { date: string; revenue: string }[];
  heatmap: { dow: number; hour: number; count: number }[];
  currency: string;
};

export type StatsBotResponse = {
  stats: Record<string, unknown>;
  joins_by_day: { date: string; new_joins: number }[];
};

export type StatsMastersResponse = {
  period: { from: string; to: string };
  masters: {
    master_id: string;
    display_name: string;
    revenue: string;
    completed_bookings: number;
    rating_avg: string | null;
    utilization_pct: number;
    payroll_amount: string;
  }[];
};

export type StatsServicesResponse = {
  period: { from: string; to: string };
  top: { service_id: string; name_i18n: Record<string, string>; revenue: string; completed_bookings: number }[];
};

export type StatsDeadServicesResponse = {
  to: string;
  dead_days: number;
  dead: { service_id: string; name_i18n: Record<string, string>; is_active: boolean }[];
};

export type StatsFinanceResponse = {
  period: { from: string; to: string };
  currency: string;
  total_payroll: number;
  rows: StatsMastersResponse["masters"];
};

export type SalonBundle = {
  salon: {
    id: string;
    name: string;
    description: Record<string, string>;
    logo_url: string | null;
    cover_url: string | null;
    favicon_url: string | null;
    contacts: Record<string, unknown>;
    timezone: string;
    currency: string;
    default_lang: string;
    license_key: string | null;
  };
  settings: {
    theme: string;
    primary_color: string;
    prepayment_enabled: boolean;
    prepayment_percent: number;
    prepayment_min_amount: string | null;
    prepayment_skip_min_visits: number;
    cancellation_free_hours: number;
    late_cancellation_policy: string;
    fine_amount: string | null;
    reminder_intervals: number[];
    reminder_message_templates: Record<string, unknown>;
    review_delay_hours: number;
    working_hours_default: Record<string, unknown>;
    booking_lead_time_minutes: number;
    booking_buffer_minutes: number;
    ai_enabled: boolean;
    ai_system_prompt: Record<string, string>;
    ai_model: string | null;
    ai_temperature: number;
    ai_few_shot_examples: { user: string; assistant: string }[];
    ai_allow_booking: boolean;
    payment_provider_config: Record<string, unknown> | null;
    integrations: Record<string, unknown>;
    date_format: string;
    time_format: string;
    updated_at: string;
  };
};

export type BlacklistEntryOut = {
  id: string;
  client_id: string;
  client_name: string | null;
  phone: string | null;
  tg_username: string | null;
  reason: string | null;
  created_at: string;
  expires_at: string | null;
};

export type UserStaffOut = {
  id: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string | null;
  lang: string;
  is_active: boolean;
  master_id: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type AuditLogOut = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

export type AIMessageOut = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  cited_chunks: string[] | null;
  flagged_negative: boolean;
};

export type AIConversationDetailOut = AIConversationOut & {
  messages: AIMessageOut[];
};
