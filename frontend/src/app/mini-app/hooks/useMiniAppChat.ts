'use client';

import { useState, useCallback } from 'react';
import { getInitData, getTelegramLanguageCode } from './useTelegram';
import type { ChatButtonItem } from '@/components/chat/ChatButtons';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function authHeaders(): Record<string, string> {
  const id = getInitData();
  return id ? { 'X-Telegram-Init-Data': id } : {};
}

export interface AiChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageDataUrl?: string;
  buttons?: ChatButtonItem[];
  buttonsDisabled?: boolean;
  hasMoreSlots?: boolean;
  allSlots?: string[];
  slotButtons?: ChatButtonItem[];
}

type AiApiResponse = {
  reply: string;
  conversation_id?: string | null;
  buttons?: ChatButtonItem[];
  booking_state?: string | null;
  has_more_slots?: boolean;
  all_slots?: string[];
  slot_buttons?: ChatButtonItem[];
};

export function useAiChat() {
  const [messages, setMessages] = useState<AiChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [bookingViaAi, setBookingViaAi] = useState(false);

  const fetchSalonFlags = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/mini-app/salon?lang=ru`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { ai_allow_booking?: boolean };
      setBookingViaAi(Boolean(data.ai_allow_booking));
    } catch {
      /* ignore */
    }
  }, []);

  const send = useCallback(
    async (text: string, imageDataUrl?: string, buttonMeta?: { value: string; label: string }) => {
      let imageBase64: string | undefined;
      let imageMimeType = 'image/jpeg';
      if (imageDataUrl) {
        const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
          imageMimeType = match[1];
          imageBase64 = match[2];
        }
      }

      const displayText = buttonMeta?.label ?? text;

      setMessages((prev) => {
        const withDisabled = prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant'
            ? { ...m, buttonsDisabled: true }
            : m,
        );
        return [
          ...withDisabled,
          {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: displayText,
            imageDataUrl: buttonMeta ? undefined : imageDataUrl,
          },
        ];
      });
      setLoading(true);

      try {
        const body: Record<string, unknown> = {
          message: buttonMeta ? '' : text || (imageDataUrl ? 'Проанализируй это фото' : ''),
          conversation_id: conversationId ?? undefined,
          image_base64: imageBase64 ?? null,
          image_mime_type: imageMimeType,
          language: getTelegramLanguageCode(),
        };
        if (buttonMeta) {
          body.button_value = buttonMeta.value;
          body.button_label = buttonMeta.label;
        }

        const res = await fetch(`${API}/api/v1/mini-app/ai`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as AiApiResponse;

        if (data.conversation_id) setConversationId(data.conversation_id);

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.reply ?? '...',
            buttons: data.buttons?.length ? data.buttons : undefined,
            buttonsDisabled: false,
            hasMoreSlots: Boolean(data.has_more_slots),
            allSlots: data.all_slots?.length ? data.all_slots : undefined,
            slotButtons: data.slot_buttons?.length ? data.slot_buttons : undefined,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Не удалось получить ответ. Попробуйте позже.',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [conversationId],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  return { messages, loading, send, reset, bookingViaAi, fetchSalonFlags };
}

export function useContactMaster() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (text: string) => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/mini-app/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setSent(false);
    setError(null);
  }, []);

  return { send, sending, sent, error, resetState };
}
