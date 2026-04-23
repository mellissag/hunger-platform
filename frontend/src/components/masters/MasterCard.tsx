"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { getPublicApiBaseUrl } from "@/lib/env";
import type { MasterOut } from "@/types/admin-api";

import { StarRating } from "./StarRating";

function photoSrc(photo_url: string | null): string | null {
  if (!photo_url) return null;
  if (photo_url.startsWith("http")) return photo_url;
  return `${getPublicApiBaseUrl()}${photo_url}`;
}

export function MasterCard({ master }: { master: MasterOut }) {
  const t = useTranslations("pages.masters");
  const src = photoSrc(master.photo_url);
  const initials = master.display_name.slice(0, 2).toUpperCase();

  return (
    <Link href={`/masters/${master.id}`} className="master-card block text-left">
      <div className="master-card-photo">
        {src ? (
          <Image src={src} alt={master.display_name} width={280} height={374} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="master-card-photo-placeholder">
            <span style={{ color: master.color_hex }}>{initials}</span>
          </div>
        )}
        <span className={`master-card-status ${master.is_active ? "active" : "inactive"}`}>
          {master.is_active ? t("statusActive") : t("statusInactive")}
        </span>
      </div>
      <div className="master-card-body">
        <h3 className="master-card-name">{master.display_name}</h3>
        <div className="master-card-rating">
          <StarRating value={master.rating_avg ? Number.parseFloat(master.rating_avg) : 0} size={14} />
          <span>
            {master.rating_count > 0 ? t("ratingCount", { count: master.rating_count }) : t("noReviews")}
          </span>
        </div>
        {master.services && master.services.length > 0 ? (
          <div className="master-card-services">
            {master.services.slice(0, 3).map((s) => (
              <span key={s.id} className="master-service-tag">
                {s.name}
              </span>
            ))}
            {master.services.length > 3 ? (
              <span className="master-service-tag muted">+{master.services.length - 3}</span>
            ) : null}
          </div>
        ) : null}
        <span className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-secondary px-3 text-sm font-medium">
          {t("open")}
        </span>
      </div>
    </Link>
  );
}
