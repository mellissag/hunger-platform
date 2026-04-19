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
