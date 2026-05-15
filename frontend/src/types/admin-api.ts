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
  effective_permissions: Record<string, boolean> | null;
  page_permissions?: Record<string, Record<string, boolean>> | null;
  salon_role_permissions?: Record<string, unknown> | null;
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

export type CalendarSlotRow = {
  id: string;
  master_id: string;
  slot_type: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

export type CalendarResponse = {
  bookings: CalendarBooking[];
  slots: CalendarSlotRow[];
};

export type ClientOut = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  whatsapp_phone?: string | null;
  tg_user_id?: number | null;
  tg_username: string | null;
  city?: string | null;
  birthday?: string | null;
  lang: string;
  source?: string;
  joined_at: string;
  joined_bot_at?: string | null;
  last_bot_activity_at?: string | null;
  total_bot_sessions?: number;
  bot_blocked?: boolean;
  total_bookings: number;
  total_revenue: string;
  no_show_count: number;
  last_visit_at: string | null;
  tags: string[];
  created_at?: string;
  updated_at?: string;
};

export type ClientStatsOut = {
  total: number;
  new_month: number;
  avg_ltv: number;
};

export type ClientBookingHistoryOut = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  price: string;
  service_name: string;
  master_name: string;
};

export type ClientReviewOut = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  master_name: string;
};

export type BlacklistEntrySlim = {
  id: string;
  reason: string | null;
  created_at: string;
};

export type ClientFunnelStatsOut = {
  started_booking: number;
  completed_booking: number;
  abandoned_booking: number;
  ai_sessions: number;
};

export type ClientAIDialogOut = {
  id: string;
  started_at: string;
  preview: string | null;
};

export type ClientBroadcastHistoryOut = {
  broadcast_id: string;
  broadcast_title: string;
  sent_at: string | null;
  status: string;
};

export type ClientLoyaltySummaryOut = {
  loyalty_points: number;
  status_id: string | null;
  status_name: string | null;
  status_background_color: string | null;
  status_text_color: string | null;
  status_assigned_manually: boolean;
  referral_code: string | null;
  referral_uses_count: number;
  total_visits: number;
  total_spent: string;
};

export type ClientDetailOut = ClientOut & {
  loyalty?: ClientLoyaltySummaryOut | null;
  notes: ClientNoteOut[];
  bookings: ClientBookingHistoryOut[];
  reviews: ClientReviewOut[];
  blacklist_entry: BlacklistEntrySlim | null;
  avg_check: string;
  favourite_service: string | null;
  favourite_master: string | null;
  funnel_stats: ClientFunnelStatsOut;
  bot_language: string;
  ai_dialogs: ClientAIDialogOut[];
  broadcasts: ClientBroadcastHistoryOut[];
};

export type MasterServiceSlim = {
  id: string;
  name: string;
};

export type MasterCertificateItem = {
  id: string;
  title: string;
  photo_url: string | null;
  year: number | null;
};

export type MasterOut = {
  id: string;
  display_name: string;
  color_hex: string;
  user_email?: string | null;
  bio: Record<string, string>;
  specialization: Record<string, string>;
  photo_url: string | null;
  rating_avg: string | null;
  rating_count: number;
  is_active: boolean;
  sort_order: number;
  payroll_percent: string;
  tg_user_id: number | null;
  /** Строки — легаси-формат, объекты — Phase 21 */
  certificates: (string | MasterCertificateItem)[];
  working_hours: Record<string, { enabled?: boolean; start?: string; end?: string }>;
  portfolio: { url: string; caption?: string; sort?: number }[];
  services: MasterServiceSlim[];
  created_at?: string;
  updated_at?: string;
};

export type MasterServiceRow = {
  service_id: string;
  price_override: string | null;
  duration_override: number | null;
  service_name: string;
};

export type MastersTodayStats = {
  bookings_today: number;
  revenue_month: number;
};

export type MasterStats = {
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  revenue: number;
  avg_check: number | null;
  no_show_count: number;
  top_services: { service_name: string; count: number; revenue: number }[];
  bookings_by_month: { month: string; count: number; revenue: number }[];
  rating_avg: number | null;
  rating_count: number;
  unique_clients: number;
  repeat_clients: number;
};

export type ReviewOut = {
  id: string;
  master_id: string;
  client_id: string | null;
  booking_id: string | null;
  rating: number;
  text: string | null;
  photo_url?: string | null;
  source: string;
  is_visible: boolean;
  created_at: string;
  client: { id: string; name: string | null } | null;
};

export type ReviewsPage = {
  items: ReviewOut[];
  total: number;
  avg: number | null;
  breakdown: Record<string, number>;
};

export type ServiceCategoryBrief = {
  id: string;
  name_i18n: Record<string, string>;
  icon: string | null;
};

export type ServiceOut = {
  id: string;
  category_id: string | null;
  categories?: ServiceCategoryBrief[];
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  duration_minutes: number;
  duration_type: string;
  duration_max_minutes: number | null;
  price: string;
  is_active: boolean;
  loyalty_points?: number;
  sort_order: number;
  photo_url: string | null;
  created_at?: string;
  updated_at?: string;
  bookings_count?: number;
  bookings_30d?: number;
  masters_count?: number;
};

export type ServiceStatsOut = {
  total: number;
  active: number;
  bookings_month: number;
  avg_revenue: number;
};

export type HealthOut = {
  redis: boolean;
  status: string;
};

export type ServiceCategoryOut = {
  id: string;
  name_i18n: Record<string, string>;
  icon: string | null;
  sort_order: number;
  created_at?: string;
  service_ids?: string[];
};

export type BookingOut = {
  id: string;
  client_id: string;
  master_id: string | null;
  service_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  price: string;
  prepayment_amount?: string | null;
  prepayment_status?: string;
  notes: string | null;
  client_comment?: string | null;
  any_master?: boolean;
  call_for_time?: boolean;
  created_via?: string;
  created_at?: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  needs_consultation?: boolean;
};

export type BookingDetailClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  tg_username: string | null;
};

export type BookingDetailMaster = {
  id: string;
  display_name: string;
  color_hex: string;
};

export type BookingDetailService = {
  id: string;
  name_i18n: Record<string, string>;
  duration_type?: string;
  duration_max_minutes?: number | null;
  duration_minutes: number;
};

export type BookingDetailOut = BookingOut & {
  client: BookingDetailClient;
  master: BookingDetailMaster | null;
  service: BookingDetailService;
};

export type BookingStatsOut = {
  today: number;
  week: number;
  month: number;
  cancellations: number;
};

export type SlotTimeOption = {
  time: string;
  available: boolean;
};

export type SlotsResponse = {
  times: string[];
  slots: SlotTimeOption[];
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

export type StatsOverviewKpi = {
  revenue: string;
  completed_bookings: number;
  bookings_started_bot: number;
  avg_check: string;
  ltv_avg: string;
  retention_repeat_clients: number;
  retention_clients_in_period: number;
  retention_rate: number;
  conversion_completed_per_bot_started: number;
  new_clients_count: number;
  cancelled_bookings_count: number;
  prev_revenue: string;
  prev_completed_bookings: number;
  prev_avg_check: string;
  prev_new_clients_count: number;
  prev_cancelled_bookings_count: number;
};

export type StatsRevenueTrendItem = {
  date: string;
  revenue: string;
  bookings_count: number;
};

export type StatsHeatmapCell = {
  dow: number;
  hour: number;
  count: number;
};

export type StatsPeakHour = {
  hour: number;
  count: number;
  avg_per_day: number;
};

export type StatsSourceItem = {
  source: string;
  count: number;
};

export type StatsFunnelStep = {
  key: string;
  count: number;
};

export type StatsTopService = {
  service_id: string;
  name_i18n: Record<string, string>;
  revenue: string;
  completed_bookings: number;
  avg_check?: string;
};

export type StatsOverviewResponse = {
  period: { from: string; to: string };
  group_by: "day" | "week" | "month";
  master_id: string | null;
  kpi: StatsOverviewKpi;
  revenue_trend: StatsRevenueTrendItem[];
  heatmap: StatsHeatmapCell[];
  peak_hours: StatsPeakHour[];
  sources: StatsSourceItem[];
  funnel: StatsFunnelStep[];
  top_services_revenue: StatsTopService[];
  top_services_popularity: StatsTopService[];
  currency: string;
};

export type StatsMastersListResponse = {
  masters: { master_id: string; display_name: string }[];
};

export type StatsBotResponse = {
  stats: Record<string, unknown>;
  joins_by_day: { date: string; new_joins: number }[];
  activity_by_day: { date: string; active_users: number }[];
  retention: {
    new_clients_in_period: number;
    retained_clients: number;
    retention_rate: number;
  };
};

export type StatsMasterRow = {
  master_id: string;
  display_name: string;
  revenue: string;
  completed_bookings: number;
  avg_check: string;
  rating_avg: string | null;
  rating_count?: number;
  utilization_pct: number;
  payroll_amount: string;
};

export type StatsMastersResponse = {
  period: { from: string; to: string };
  currency: string;
  masters: StatsMasterRow[];
};

export type StatsMasterDetailResponse = StatsMasterRow & {
  period: { from: string; to: string };
  currency: string;
  revenue_by_day: StatsRevenueTrendItem[];
  services_breakdown: StatsTopService[];
  unique_clients: number;
  new_clients: number;
  repeat_clients: number;
  recent_bookings: {
    booking_id: string;
    starts_at: string | null;
    price: string;
    status: string;
    client_name: string;
    service_name_i18n: Record<string, string>;
  }[];
};

export type StatsServicesResponse = {
  period: { from: string; to: string };
  order_by: "revenue" | "popularity";
  currency: string;
  top: StatsTopService[];
};

export type StatsDeadServicesResponse = {
  to: string;
  dead_days: number;
  dead: {
    service_id: string;
    name_i18n: Record<string, string>;
    is_active: boolean;
    last_booking_at: string | null;
  }[];
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
    admin_notify_chat_id: string | null;
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
  permissions: Record<string, unknown> | null;
  effective_permissions: Record<string, boolean> | null;
  page_permissions?: Record<string, Record<string, boolean>> | null;
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
