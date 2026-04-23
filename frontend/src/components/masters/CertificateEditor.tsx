"use client";

import { ImageIcon, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { MasterCertificateItem } from "@/types/admin-api";
import { getPublicApiBaseUrl } from "@/lib/env";

export type CertificateDraft = MasterCertificateItem & {
  _file?: File;
  _preview?: string;
};

type CertificateEditorProps = {
  value: CertificateDraft[];
  onChange: (next: CertificateDraft[]) => void;
};

function certImageSrc(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("http")) return photoUrl;
  return `${getPublicApiBaseUrl()}${photoUrl}`;
}

export function CertificateEditor({ value, onChange }: CertificateEditorProps) {
  const t = useTranslations("pages.masters");

  function addCert() {
    onChange([
      ...value,
      { id: crypto.randomUUID(), title: "", photo_url: null, year: null },
    ]);
  }

  function updateCert(id: string, patch: Partial<CertificateDraft>) {
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCert(id: string) {
    const row = value.find((c) => c.id === id);
    if (row?._preview) {
      URL.revokeObjectURL(row._preview);
    }
    onChange(value.filter((c) => c.id !== id));
  }

  function onPhotoChange(id: string, file: File) {
    const row = value.find((c) => c.id === id);
    if (row?._preview) {
      URL.revokeObjectURL(row._preview);
    }
    const preview = URL.createObjectURL(file);
    updateCert(id, { _file: file, _preview: preview, photo_url: null });
  }

  return (
    <div className="space-y-2.5">
      {value.map((cert) => (
        <div
          key={cert.id}
          className="flex gap-3 rounded-md border border-border bg-muted/40 p-3.5"
        >
          <label className="shrink-0 cursor-pointer self-start">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onPhotoChange(cert.id, f);
              }}
            />
            {cert._preview || cert.photo_url ? (
              <Image
                width={64}
                height={64}
                unoptimized
                src={cert._preview ?? certImageSrc(cert.photo_url) ?? ""}
                alt=""
                className="h-16 w-16 rounded object-cover"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-border bg-background text-muted-foreground"
                aria-hidden
              >
                <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
              </div>
            )}
          </label>

          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={cert.title}
              onChange={(e) => updateCert(cert.id, { title: e.target.value })}
              placeholder={t("certTitlePlaceholder")}
              className="form-input-premium w-full font-sans"
            />
            <input
              type="number"
              value={cert.year ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                updateCert(cert.id, { year: raw === "" ? null : Number.parseInt(raw, 10) || null });
              }}
              placeholder={t("certYearPlaceholder")}
              className="form-input-premium max-w-[160px] font-sans"
            />
          </div>

          <button
            type="button"
            onClick={() => removeCert(cert.id)}
            className="shrink-0 self-start p-1.5 text-destructive transition-colors hover:text-destructive/80"
            aria-label={t("actionRemove")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        className="w-full gap-1.5 text-[11px] font-medium uppercase tracking-wider"
        onClick={addCert}
      >
        <Plus className="h-3.5 w-3.5" />
        {t("actionAddCertificate")}
      </Button>
    </div>
  );
}
