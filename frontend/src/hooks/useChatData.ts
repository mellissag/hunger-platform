"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFormData, apiJson } from "@/lib/api";
import { getPublicApiBaseUrl } from "@/lib/env";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatTagSummary {
  id: string;
  name: string;
  color: string;
}

export interface ChatTag extends ChatTagSummary {
  is_default: boolean;
}

export interface ChatListItem {
  client_id: string;
  tg_user_id: number | null;
  first_name: string | null;
  last_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  note: string | null;
  tags: ChatTagSummary[];
}

export interface ChatMessage {
  id: string;
  client_id: string;
  direction: "inbound" | "outbound";
  message_type: "text" | "photo" | "video" | "voice" | "document" | "sticker";
  text?: string | null;
  media_path?: string | null;
  tg_message_id?: number | null;
  is_read: boolean;
  created_at: string;
}

export type WsEvent =
  | ({ _event: "new_message" } & ChatMessage)
  | { _event: "read"; client_id: string };

// ── Query keys ────────────────────────────────────────────────────────────────

export const chatKeys = {
  list: ["admin", "chats"] as const,
  messages: (clientId: string) => ["admin", "chats", clientId, "messages"] as const,
  tags: ["admin", "chat-tags"] as const,
};

// ── Chat list ─────────────────────────────────────────────────────────────────

export function useChatList() {
  return useQuery<ChatListItem[]>({
    queryKey: chatKeys.list,
    queryFn: () => apiJson<ChatListItem[]>("/admin/chats"),
    staleTime: Infinity,
    refetchInterval: false,
  });
}

// ── Message history ───────────────────────────────────────────────────────────

export function useChatMessages(clientId: string | null) {
  return useQuery<ChatMessage[]>({
    queryKey: clientId ? chatKeys.messages(clientId) : ["admin", "chats", null, "messages"],
    queryFn: () => apiJson<ChatMessage[]>(`/admin/chats/${clientId}/messages`),
    enabled: !!clientId,
    staleTime: Infinity,
  });
}

// ── Mark read ─────────────────────────────────────────────────────────────────

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      apiJson(`/admin/chats/${clientId}/read`, { method: "POST" }),
    onSuccess: (_data, clientId) => {
      qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) =>
        old.map((c) => (c.client_id === clientId ? { ...c, unread_count: 0 } : c)),
      );
    },
  });
}

// ── Send text ─────────────────────────────────────────────────────────────────

export function useSendText() {
  return useMutation({
    mutationFn: ({ clientId, text }: { clientId: string; text: string }) =>
      apiJson(`/admin/chats/${clientId}/send/text`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
  });
}

// ── Send media ────────────────────────────────────────────────────────────────

export function useSendMedia() {
  return useMutation({
    mutationFn: ({
      clientId,
      file,
      caption,
    }: {
      clientId: string;
      file: File;
      caption?: string;
    }) => {
      const fd = new FormData();
      fd.append("file", file);
      if (caption) fd.append("caption", caption);
      return apiFormData<{ ok: boolean; message_id: string }>(
        `/admin/chats/${clientId}/send/media`,
        fd,
      );
    },
  });
}

// ── Chat tags (global dictionary) ─────────────────────────────────────────────

export function useChatTags() {
  return useQuery<ChatTag[]>({
    queryKey: chatKeys.tags,
    queryFn: () => apiJson<ChatTag[]>("/admin/chat-tags"),
    staleTime: 5 * 60_000,
  });
}

export function useCreateChatTag() {
  const qc = useQueryClient();
  return useMutation<ChatTag, Error, { name: string; color: string }>({
    mutationFn: (payload) =>
      apiJson<ChatTag>("/admin/chat-tags", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.tags });
    },
  });
}

export function useDeleteChatTag() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (tagId) =>
      apiJson(`/admin/chat-tags/${tagId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.tags });
      void qc.invalidateQueries({ queryKey: chatKeys.list });
    },
  });
}

// ── Chat tag assignment ───────────────────────────────────────────────────────

export function useAssignChatTag() {
  const qc = useQueryClient();
  return useMutation<ChatTagSummary[], Error, { clientId: string; tagId: string }>({
    mutationFn: ({ clientId, tagId }) =>
      apiJson<ChatTagSummary[]>(`/admin/chats/${clientId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_id: tagId }),
      }),
    onSuccess: (tags, { clientId }) => {
      qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) =>
        old.map((c) => (c.client_id === clientId ? { ...c, tags } : c)),
      );
    },
  });
}

export function useUnassignChatTag() {
  const qc = useQueryClient();
  return useMutation<ChatTagSummary[], Error, { clientId: string; tagId: string }>({
    mutationFn: ({ clientId, tagId }) =>
      apiJson<ChatTagSummary[]>(`/admin/chats/${clientId}/tags/${tagId}`, {
        method: "DELETE",
      }),
    onSuccess: (tags, { clientId }) => {
      qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) =>
        old.map((c) => (c.client_id === clientId ? { ...c, tags } : c)),
      );
    },
  });
}

// ── Chat note ─────────────────────────────────────────────────────────────────

export function useUpdateChatNote() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; note: string | null },
    Error,
    { clientId: string; note: string | null }
  >({
    mutationFn: ({ clientId, note }) =>
      apiJson(`/admin/chats/${clientId}/note`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      }),
    onSuccess: (data, { clientId }) => {
      qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) =>
        old.map((c) =>
          c.client_id === clientId ? { ...c, note: data.note } : c,
        ),
      );
    },
  });
}

// ── Soft delete chat ──────────────────────────────────────────────────────────

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (clientId) =>
      apiJson(`/admin/chats/${clientId}`, { method: "DELETE" }),
    onSuccess: (_data, clientId) => {
      qc.setQueryData<ChatListItem[]>(chatKeys.list, (old = []) =>
        old.filter((c) => c.client_id !== clientId),
      );
    },
  });
}

// ── WebSocket hook ────────────────────────────────────────────────────────────

async function _getWsTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/ws-ticket", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { token: string | null };
    return data.token ?? null;
  } catch {
    return null;
  }
}

export function useChatWebSocket(onEvent: (e: WsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function connect() {
      const token = await _getWsTicket();
      if (!token || cancelled) return;

      const backendBase = getPublicApiBaseUrl()
        .replace("https://", "wss://")
        .replace("http://", "ws://");

      const url = `${backendBase}/api/v1/admin/chats/ws?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as WsEvent;
          onEventRef.current(data);
        } catch {
          // ignore malformed
        }
      };

      ws.onerror = () => {
        // Reconnect after 5s on error
        setTimeout(() => { if (!cancelled) void connect(); }, 5_000);
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (!cancelled) setTimeout(() => { void connect(); }, 5_000);
      };

      ws.onopen = () => {
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25_000);
      };
    }

    void connect();

    return () => {
      cancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      ws?.close();
    };
  }, []);
}
