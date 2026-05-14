"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Smartphone,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { apiJson, HttpError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MasterDataBadge } from "@/components/layout/MasterDataBadge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChatNoteEditor,
  ChatTagPicker,
  ChatTagsSettingsDialog,
  TagBadge,
} from "@/components/chats/chat-tags";
import {
  chatKeys,
  ChatListItem,
  ChatMessage,
  useChatList,
  useChatMessages,
  useChatWebSocket,
  useDeleteChat,
  useMarkRead,
  useSendMedia,
  useSendText,
  useUpdateChatNote,
  WsEvent,
} from "@/hooks/useChatData";
import type { ClientOut } from "@/types/admin-api";

function isClientIdParam(s: string | null): s is string {
  return Boolean(
    s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  );
}

/**
 * Same-origin `/media/...` — в проде Caddy проксирует на FastAPI; в dev `next.config` rewrites на API.
 * Accepts API shapes: `/media/chat/x`, `chat/x`, full http URL.
 */
function chatMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  const p = path.trim();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  let rest = p;
  if (rest.startsWith("/media/")) rest = rest.slice("/media/".length);
  else if (rest.startsWith("media/")) rest = rest.slice("media/".length);
  rest = rest.replace(/^\/+/, "");
  return `/media/${rest}`;
}

function isLikelyRasterImagePath(p: string | null | undefined): boolean {
  if (!p) return false;
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(p);
}

function digitsOnly(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D/g, "");
}

// ── Sound notification ────────────────────────────────────────────────────────

function playNotify() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // AudioContext not available
  }
}

// ── Time formatter ────────────────────────────────────────────────────────────

function fmtTime(iso: string, locale: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const locale = useLocale();
  const t = useTranslations("pages.chats");
  const isWa = msg.channel === "whatsapp";
  const isOut = msg.direction === "outbound";
  const mediaSrc = chatMediaUrl(msg.media_path);
  const showImagePreview =
    Boolean(mediaSrc) &&
    (msg.message_type === "photo" ||
      msg.message_type === "sticker" ||
      (msg.message_type === "document" && isLikelyRasterImagePath(msg.media_path)));

  return (
    <div
      className={cn(
        "flex max-w-[72%] flex-col rounded-2xl px-3 py-2 shadow-sm",
        isOut
          ? "ml-auto bg-primary text-primary-foreground"
          : "mr-auto border border-border bg-card text-foreground",
      )}
    >
      {showImagePreview ? (
        <a href={mediaSrc} target="_blank" rel="noreferrer" className="block min-h-[80px] min-w-[80px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin /media (Caddy or next rewrite) */}
          <img
            src={mediaSrc}
            alt=""
            className="max-h-48 w-full max-w-[260px] min-h-[80px] rounded-xl object-cover"
          />
        </a>
      ) : null}
      {msg.message_type === "video" && msg.media_path && (
        <video
          src={chatMediaUrl(msg.media_path)}
          controls
          className="max-h-48 w-full rounded-xl"
        />
      )}
      {msg.message_type === "voice" && msg.media_path && (
        <audio src={chatMediaUrl(msg.media_path)} controls className="w-full" />
      )}
      {msg.message_type === "document" && msg.media_path && !isLikelyRasterImagePath(msg.media_path) && (
        <a
          href={chatMediaUrl(msg.media_path)}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline"
        >
          📎 {t("docAttachment")}
        </a>
      )}
      {msg.text && (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{msg.text}</p>
      )}
      <span
        className={cn(
          "mt-1 flex items-center gap-1 self-end text-[10px]",
          isOut ? "text-primary-foreground/60" : "text-muted-foreground",
        )}
      >
        {isWa ? (
          <span className="rounded bg-muted px-1 font-medium text-muted-foreground" title={t("whatsappChannel")}>
            {t("channelBadgeWhatsApp")}
          </span>
        ) : null}
        {fmtTime(msg.created_at, locale)}
      </span>
    </div>
  );
}

// ── Chat list item ────────────────────────────────────────────────────────────

const MAX_VISIBLE_TAGS = 2;

function ChatListRow({
  chat,
  active,
  onClick,
  onAskDelete,
}: {
  chat: ChatListItem;
  active: boolean;
  onClick: () => void;
  onAskDelete: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("pages.chats");
  const initials = `${(chat.first_name ?? "?").charAt(0)}${(chat.last_name ?? "").charAt(0)}`.toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleTags = chat.tags.slice(0, MAX_VISIBLE_TAGS);
  const extraTagCount = chat.tags.length - visibleTags.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40",
        active && "border-l-2 border-primary bg-primary/5 hover:bg-primary/5",
      )}
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-xs font-semibold text-primary-foreground">
          {initials}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium">
            {chat.first_name} {chat.last_name ?? ""}
          </span>
          {chat.last_message_at && (
            <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
              {fmtTime(chat.last_message_at, locale)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className="flex max-w-[140px] items-center gap-1 truncate text-xs text-muted-foreground">
            {chat.last_message_channel === "whatsapp" ? (
              <span
                className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground"
                title={t("whatsappChannel")}
              >
                {t("channelBadgeWhatsApp")}
              </span>
            ) : null}
            <span className="truncate">{chat.last_message ?? "—"}</span>
          </p>
          {chat.unread_count > 0 && (
            <span className="ml-1 flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {chat.unread_count > 9 ? "9+" : chat.unread_count}
            </span>
          )}
        </div>
        {chat.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {visibleTags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
            {extraTagCount > 0 && (
              <span className="text-[10px] text-muted-foreground">+{extraTagCount}</span>
            )}
          </div>
        )}
        {chat.note && (
          <p className="mt-1 truncate text-[11px] italic text-muted-foreground">
            {chat.note}
          </p>
        )}
      </div>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(true);
            }}
            className={cn(
              "absolute right-2 top-2 rounded p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
            aria-label={t("rowMenuLabel")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <ChatTagPicker
            clientId={chat.client_id}
            currentTags={chat.tags}
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <TagIcon className="mr-2 h-3.5 w-3.5" />
                {t("menuAddTag")}
              </DropdownMenuItem>
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              onAskDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {t("menuDelete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientFromUrl = isClientIdParam(searchParams.get("client"))
    ? searchParams.get("client")!
    : null;

  const t = useTranslations("pages.chats");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [replyChannel, setReplyChannel] = useState<"telegram" | "whatsapp">("telegram");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Chats with no messages yet — not returned by GET /admin/chats; pinned after opening from `/clients`. */
  const [pinnedExtras, setPinnedExtras] = useState<ChatListItem[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: chatList = [], isPending: chatListPending } = useChatList();
  const updateNote = useUpdateChatNote();
  const deleteChat = useDeleteChat();

  const hasChatRow = useCallback(
    (id: string) => chatList.some((c) => c.client_id === id),
    [chatList],
  );

  const needBootstrap =
    Boolean(clientFromUrl) &&
    !chatListPending &&
    clientFromUrl !== null &&
    !hasChatRow(clientFromUrl);

  const {
    data: clientBootstrap,
    isError: clientBootstrapError,
    isFetched: clientBootstrapFetched,
  } = useQuery({
    queryKey: ["clients", clientFromUrl, "open-chat"],
    queryFn: () => apiJson<ClientOut>(`/clients/${clientFromUrl}`),
    enabled: needBootstrap && clientFromUrl !== null,
  });

  const mergedChatList = useMemo(() => {
    const ids = new Set(chatList.map((c) => c.client_id));
    const extras = pinnedExtras.filter((p) => !ids.has(p.client_id));
    return [...extras, ...chatList];
  }, [pinnedExtras, chatList]);

  useEffect(() => {
    setPinnedExtras((prev) =>
      prev.filter((p) => !chatList.some((c) => c.client_id === p.client_id)),
    );
  }, [chatList]);
  const { data: messages = [], isLoading: msgsLoading } = useChatMessages(activeId);
  const markRead = useMarkRead();
  const sendText = useSendText();
  const sendMedia = useSendMedia();

  useEffect(() => {
    if (!activeId) {
      setReplyChannel("telegram");
      return;
    }
    const ac = mergedChatList.find((c) => c.client_id === activeId);
    const inbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (inbound?.channel === "whatsapp") {
      setReplyChannel("whatsapp");
    } else if (inbound?.channel === "telegram") {
      setReplyChannel("telegram");
    } else if (ac?.can_reply_whatsapp && !ac?.can_reply_telegram) {
      setReplyChannel("whatsapp");
    } else {
      setReplyChannel("telegram");
    }
  }, [activeId, messages, mergedChatList]);

  useEffect(() => {
    const raw = searchParams.get("client");
    if (raw && !isClientIdParam(raw)) {
      toast.error(t("toastInvalidLink"));
      router.replace("/chats", { scroll: false });
    }
  }, [searchParams, router, t]);

  useEffect(() => {
    if (!clientFromUrl || chatListPending) return;
    if (!hasChatRow(clientFromUrl)) return;
    setActiveId(clientFromUrl);
    markRead.mutate(clientFromUrl);
    router.replace("/chats", { scroll: false });
  }, [clientFromUrl, chatListPending, hasChatRow, router, markRead]);

  useEffect(() => {
    if (!clientFromUrl || chatListPending) return;
    if (hasChatRow(clientFromUrl)) return;
    if (clientBootstrapError) return;
    if (!clientBootstrapFetched) return;
    if (!clientBootstrap || clientBootstrap.id !== clientFromUrl) return;
    const hasTg = Boolean(clientBootstrap.tg_user_id);
    const hasWaDigits = Boolean(
      digitsOnly(clientBootstrap.whatsapp_phone ?? clientBootstrap.phone ?? ""),
    );
    if (!hasTg && !hasWaDigits) {
      toast.error(t("toastNoContactChannel"));
      router.replace("/chats", { scroll: false });
      return;
    }
    if (hasTg && clientBootstrap.bot_blocked) {
      toast.error(t("toastBotBlocked"));
      router.replace("/chats", { scroll: false });
      return;
    }
    const row: ChatListItem = {
      client_id: clientBootstrap.id,
      tg_user_id: clientBootstrap.tg_user_id ?? null,
      first_name: clientBootstrap.first_name,
      last_name: clientBootstrap.last_name,
      last_message: null,
      last_message_at: null,
      unread_count: 0,
      note: null,
      tags: [],
      can_reply_telegram: hasTg,
      can_reply_whatsapp: hasWaDigits,
    };
    setPinnedExtras((prev) =>
      prev.some((p) => p.client_id === row.client_id) ? prev : [row, ...prev],
    );
    setActiveId(clientFromUrl);
    router.replace("/chats", { scroll: false });
  }, [
    clientFromUrl,
    chatListPending,
    hasChatRow,
    clientBootstrap,
    clientBootstrapFetched,
    clientBootstrapError,
    router,
    t,
  ]);

  useEffect(() => {
    if (!needBootstrap || !clientBootstrapFetched || !clientBootstrapError || !clientFromUrl) return;
    toast.error(t("toastClientNotFound"));
    router.replace("/chats", { scroll: false });
  }, [needBootstrap, clientBootstrapFetched, clientBootstrapError, clientFromUrl, router, t]);

  // ── Browser notification permission ─────────────────────────────────────────
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  function showBrowserNotification(title: string, body: string) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.hasFocus()) return; // Only notify when tab is not focused
    try {
      const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "chat-message",
      });
      setTimeout(() => n.close(), 6000);
    } catch {
      // Notification API not supported
    }
  }

  // ── WebSocket event handler ──────────────────────────────────────────────────
  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event._event === "new_message") {
        const raw = event as ChatMessage & { _event: string };
        const msg: ChatMessage & { _event: string } = {
          ...raw,
          channel: raw.channel ?? "telegram",
        };

        // Append to open conversation cache
        qc.setQueryData<ChatMessage[]>(chatKeys.messages(msg.client_id), (old = []) => {
          if (old.find((m) => m.id === msg.id)) return old;
          return [...old, msg];
        });

        // Update chat list
        qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) => {
          const preview =
            msg.text ??
            (msg.message_type !== "text"
              ? t("messagePreviewFallback", { type: msg.message_type })
              : "");
          const exists = old.find((c) => c.client_id === msg.client_id);
          let updated: ChatListItem[];
          if (exists) {
            updated = old.map((c) =>
              c.client_id === msg.client_id
                ? {
                    ...c,
                    last_message: preview,
                    last_message_at: msg.created_at,
                    last_message_channel: msg.channel,
                    unread_count:
                      msg.direction === "inbound" && msg.client_id !== activeId
                        ? c.unread_count + 1
                        : c.unread_count,
                  }
                : c,
            );
          } else {
            // Unknown client — refetch the list
            void qc.invalidateQueries({ queryKey: chatKeys.list });
            return old;
          }
          return [...updated].sort((a, b) =>
            (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
          );
        });

        // Sound + browser notification for inbound messages from other clients
        if (msg.direction === "inbound" && msg.client_id !== activeId) {
          playNotify();
          const clientInfo = mergedChatList.find((c) => c.client_id === msg.client_id);
          const senderName = [clientInfo?.first_name, clientInfo?.last_name]
            .filter(Boolean)
            .join(" ") || t("unknownContact");
          showBrowserNotification(
            t("newMessageTitle", { name: senderName }),
            msg.text ??
              (msg.message_type !== "text"
                ? t("messagePreviewFallback", { type: msg.message_type })
                : ""),
          );
        }
      }

      if (event._event === "read") {
        qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) =>
          old.map((c) =>
            c.client_id === (event as { client_id: string }).client_id
              ? { ...c, unread_count: 0 }
              : c,
          ),
        );
      }
    },
    [activeId, qc, chatList, mergedChatList, t],
  );

  useChatWebSocket(handleWsEvent);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Open chat ──────────────────────────────────────────────────────────────
  function openChat(clientId: string) {
    setActiveId(clientId);
    markRead.mutate(clientId);
  }

  // ── Send text ──────────────────────────────────────────────────────────────
  function handleSend() {
    if (!activeId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    sendText.mutate(
      { clientId: activeId, text, channel: replyChannel },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: chatKeys.messages(activeId) });
          void qc.invalidateQueries({ queryKey: chatKeys.list });
        },
      },
    );
  }

  // ── Send media ─────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    sendMedia.mutate(
      { clientId: activeId, file },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: chatKeys.messages(activeId) });
          void qc.invalidateQueries({ queryKey: chatKeys.list });
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
        onError: (err) => {
          const msg = err instanceof HttpError ? err.message : t("mediaSendError");
          toast.error(msg);
        },
      },
    );
  }

  const filteredChats = mergedChatList.filter((c) => {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const activeClient = mergedChatList.find((c) => c.client_id === activeId);
  const totalUnread = mergedChatList.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden rounded-xl border border-border bg-background shadow-sm">

      {/* ── Left: chat list ────────────────────────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h1 className="font-playfair text-base font-semibold">{t("title")}</h1>
          <MasterDataBadge pagePermission="page_chats" />
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
          <ChatTagsSettingsDialog />
        </div>

        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.map((chat) => (
            <ChatListRow
              key={chat.client_id}
              chat={chat}
              active={activeId === chat.client_id}
              onClick={() => openChat(chat.client_id)}
              onAskDelete={() => setConfirmDeleteId(chat.client_id)}
            />
          ))}
          {filteredChats.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {mergedChatList.length === 0 ? t("noConversations") : t("noSearchResults")}
            </p>
          )}
        </div>
      </aside>

      {/* ── Right: conversation ────────────────────────────────────────────── */}
      {activeId ? (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-xs font-semibold text-primary-foreground">
                {`${(activeClient?.first_name ?? "?").charAt(0)}${(activeClient?.last_name ?? "").charAt(0)}`.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {activeClient?.first_name} {activeClient?.last_name ?? ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {replyChannel === "whatsapp"
                    ? t("replyChannelWhatsApp")
                    : `${t("telegramId")}: ${activeClient?.tg_user_id ?? "—"}`}
                </p>
                {activeClient &&
                (activeClient.can_reply_telegram || activeClient.can_reply_whatsapp) ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {activeClient.can_reply_telegram ? (
                      <button
                        type="button"
                        onClick={() => setReplyChannel("telegram")}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                          replyChannel === "telegram"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {t("replyViaTelegram")}
                      </button>
                    ) : null}
                    {activeClient.can_reply_whatsapp ? (
                      <button
                        type="button"
                        onClick={() => setReplyChannel("whatsapp")}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                          replyChannel === "whatsapp"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {t("replyViaWhatsApp")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {activeClient && (
                <div className="flex flex-wrap items-center gap-1">
                  {activeClient.tags.map((tag) => (
                    <TagBadge
                      key={tag.id}
                      tag={tag}
                      size="md"
                    />
                  ))}
                  <ChatTagPicker
                    clientId={activeClient.client_id}
                    currentTags={activeClient.tags}
                    align="end"
                    trigger={
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        aria-label={t("menuAddTag")}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {t("addTag")}
                      </button>
                    }
                  />
                </div>
              )}
            </div>
            {activeClient && (
              <ChatNoteEditor
                clientId={activeClient.client_id}
                initialNote={activeClient.note}
                onSave={(note) =>
                  updateNote.mutateAsync({
                    clientId: activeClient.client_id,
                    note,
                  })
                }
              />
            )}
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-muted/20 px-4 py-3">
            {msgsLoading && (
              <p className="text-center text-xs text-muted-foreground">{t("loadingMessages")}</p>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="flex items-end gap-2 border-t border-border bg-card px-3 py-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={replyChannel === "whatsapp"}
              className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              title={t("attachFile")}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.ogg,.pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileChange}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t("inputPlaceholder")}
              rows={1}
              className="max-h-28 min-h-[38px] flex-1 resize-none overflow-auto rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || sendText.isPending}
              className="flex-shrink-0 rounded-xl bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-40"
              title={t("send")}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
          <MessageSquare className="h-14 w-14 text-muted-foreground/20" strokeWidth={1.2} />
          <p className="text-sm">{t("selectConversation")}</p>
        </div>
      )}

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirmDeleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDeleteId) return;
                const id = confirmDeleteId;
                setConfirmDeleteId(null);
                try {
                  await deleteChat.mutateAsync(id);
                  if (activeId === id) setActiveId(null);
                  toast.success(t("deletedToast"));
                } catch (err) {
                  toast.error(
                    err instanceof HttpError
                      ? err.message
                      : t("deleteError"),
                  );
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("confirmDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
