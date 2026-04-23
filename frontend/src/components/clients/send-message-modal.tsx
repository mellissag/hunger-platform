"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiJson } from "@/lib/api";
import type { ClientOut } from "@/types/admin-api";

type Props = {
  client: ClientOut | null;
  open: boolean;
  onClose: () => void;
};

export function SendMessageModal({ client, open, onClose }: Props) {
  const t = useTranslations("pages.clientDetail");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!client || !text.trim()) return;
    setSending(true);
    try {
      await apiJson<{ ok: boolean; message: string }>(`/clients/${client.id}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), parse_mode: "HTML" }),
      });
      toast.success(t("toastMessageSent", { name: client.first_name ?? "" }));
      setText("");
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("toastMessageError"));
    } finally {
      setSending(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-playfair text-left">
            {t("sendModalTitle", {
              name: [client.first_name, client.last_name].filter(Boolean).join(" ") || "—",
            })}
          </DialogTitle>
          <p className="text-left text-xs text-muted-foreground">{t("sendModalSubtitle")}</p>
        </DialogHeader>

        {!client.tg_user_id ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950">
            {t("sendModalNoTg")}
          </div>
        ) : null}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("sendModalPlaceholder")}
          rows={5}
          maxLength={4096}
          disabled={!client.tg_user_id}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-right text-[11px] text-muted-foreground">
          {text.length} / 4096
        </p>

        {text.trim() ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(37_53%_40%)]">
              {t("sendModalPreview")}
            </p>
            <p className="whitespace-pre-wrap text-sm">{text}</p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("sendModalCancel")}
          </Button>
          <Button
            type="button"
            className="bg-[hsl(37_53%_40%)] text-white hover:bg-[hsl(37_53%_34%)]"
            onClick={() => void handleSend()}
            disabled={!text.trim() || !client.tg_user_id || sending}
          >
            {sending ? t("sendModalSending") : t("sendModalSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
