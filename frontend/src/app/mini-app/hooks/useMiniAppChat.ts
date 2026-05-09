'use client';

import { useState, useCallback } from 'react';
import { getInitData } from './useTelegram';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function authHeaders(): Record<string, string> {
  const id = getInitData();
  return id ? { 'X-Telegram-Init-Data': id } : {};
}

export interface AiChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageDataUrl?: string; // for display in chat
}

export function useAiChat() {
  const [messages, setMessages] = useState<AiChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const send = useCallback(
    async (text: string, imageDataUrl?: string) => {
      // Extract base64 from data URL (e.g. "data:image/jpeg;base64,/9j/...")
      let imageBase64: string | undefined;
      let imageMimeType = 'image/jpeg';
      if (imageDataUrl) {
        const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
          imageMimeType = match[1];
          imageBase64 = match[2];
        }
      }

      const userMsg: AiChatMsg = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        imageDataUrl,
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await fetch(`${API}/api/v1/mini-app/ai`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({
            message: text || (imageDataUrl ? 'Проанализируй это фото' : ''),
            conversation_id: conversationId ?? undefined,
            image_base64: imageBase64 ?? null,
            image_mime_type: imageMimeType,
          }),
        });

        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { reply: string; conversation_id?: string | null };

        if (data.conversation_id) setConversationId(data.conversation_id);

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: data.reply ?? '...' },
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

  return { messages, loading, send, reset };
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
