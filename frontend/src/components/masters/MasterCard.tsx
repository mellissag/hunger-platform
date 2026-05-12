"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteMaster } from "@/hooks/useMasters";
import { getPublicApiBaseUrl } from "@/lib/env";
import type { MasterOut } from "@/types/admin-api";

import { StarRating } from "./StarRating";

function photoSrc(photo_url: string | null): string | null {
  if (!photo_url) return null;
  if (photo_url.startsWith("http")) return photo_url;
  return `${getPublicApiBaseUrl()}${photo_url}`;
}

export function MasterCard({
  master,
  canDelete = false,
}: {
  master: MasterOut;
  canDelete?: boolean;
}) {
  const t = useTranslations("pages.masters");
  const src = photoSrc(master.photo_url);
  const initials = master.display_name.slice(0, 2).toUpperCase();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMaster = useDeleteMaster();

  return (
    <div className="relative">
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

      {canDelete ? (
        <button
          type="button"
          aria-label={t("deleteTooltip")}
          title={t("deleteTooltip")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className="absolute left-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-destructive shadow-sm backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-destructive/40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDesc", { name: master.display_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMaster.isPending}>
              {t("deleteCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMaster.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMaster.mutate(master.id, {
                  onSuccess: () => {
                    toast.success(t("deleteSuccess"));
                    setConfirmOpen(false);
                  },
                  onError: (err: Error) =>
                    toast.error(err.message || t("deleteError")),
                });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
