"use client";

import { useState } from "react";
import { useConsultationBookings } from "@/hooks/useBookings";
import { BookingDetailDrawer } from "./booking-detail-drawer";
import type { BookingOut } from "@/types/admin-api";

const GOLD = "#9A7230";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ConsultationRequestsPanel({ salonTz = "Europe/Sofia" }: { salonTz?: string }) {
  const { data: raw = [] } = useConsultationBookings();
  // The hook returns Paginated<BookingOut> but we mapped it to items below
  const requests: BookingOut[] = (raw as unknown as { items?: BookingOut[] }).items ?? (Array.isArray(raw) ? (raw as BookingOut[]) : []);

  const [expanded, setExpanded] = useState(true);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);

  if (requests.length === 0 && expanded === false) return null;

  return (
    <div className="mb-6">
      {/* Section header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-3 w-full mb-3 group"
      >
        <div className="flex items-center gap-2">
          {/* Phone icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={GOLD}
            strokeWidth="2"
          >
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.95 9.63a19.79 19.79 0 01-3.07-8.67A2 2 0 012.88 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
          </svg>
          <span
            className="text-xs font-semibold tracking-[0.18em] uppercase"
            style={{ color: GOLD }}
          >
            Ожидают уточнения
          </span>
          {requests.length > 0 && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
              style={{ background: GOLD }}
            >
              {requests.length}
            </span>
          )}
        </div>
        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`ml-auto text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <>
          {requests.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-3 border border-dashed border-border rounded-sm bg-muted/20 text-muted-foreground">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span className="text-sm">Заявок на уточнение нет</span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {requests.map((req) => (
                <ConsultationCard
                  key={req.id}
                  booking={req}
                  onView={() => setOpenBookingId(req.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Reuse existing booking detail drawer */}
      <BookingDetailDrawer
        bookingId={openBookingId}
        open={Boolean(openBookingId)}
        onOpenChange={(v) => { if (!v) setOpenBookingId(null); }}
        salonTz={salonTz}
      />
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function ConsultationCard({
  booking,
  onView,
}: {
  booking: BookingOut;
  onView: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 w-[220px] rounded-sm p-4 relative overflow-hidden"
      style={{
        border: `1px solid rgba(154,114,48,.25)`,
        background: "rgba(154,114,48,.04)",
      }}
    >
      {/* Gold top stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg, transparent, #C9A84C, transparent)",
        }}
      />

      {/* Date */}
      <div className="text-[10px] text-muted-foreground mb-2">
        {formatCreatedAt(booking.created_at)}
      </div>

      {/* Service */}
      <div className="font-serif text-sm font-medium text-foreground leading-tight mb-2 truncate">
        {booking.service_id ? "Услуга" : "Не указана"}
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 mb-3">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: GOLD }}
        />
        <span
          className="text-[10px] font-semibold tracking-wide uppercase"
          style={{ color: GOLD }}
        >
          Нужен созвон
        </span>
      </div>

      {/* View button */}
      <button
        onClick={onView}
        className="w-full text-[10px] font-semibold tracking-[0.12em] uppercase rounded-sm py-2 px-3 transition-colors"
        style={{
          border: `1px solid rgba(154,114,48,.35)`,
          color: GOLD,
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(154,114,48,.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        Подробнее →
      </button>
    </div>
  );
}
