"use client";

import Link from "next/link";
import { MessageSquare, Search, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FAKE_CHATS = [
  {
    id: "1",
    name: "Мария Иванова",
    avatar: "МИ",
    color: "#9A7230",
    preview: "Хочу записаться на окрашивание...",
    time: "10:24",
    unread: 2,
    online: true,
  },
  {
    id: "2",
    name: "Карина Бойко",
    avatar: "КБ",
    color: "#16a34a",
    preview: "Спасибо, жду вашего подтверждения!",
    time: "Вчера",
    unread: 0,
    online: false,
  },
  {
    id: "3",
    name: "Алина Дорошенко",
    avatar: "АД",
    color: "#2563eb",
    preview: "Можно перенести запись на пятницу?",
    time: "Вт",
    unread: 1,
    online: false,
  },
  {
    id: "4",
    name: "Виктория Семенова",
    avatar: "ВС",
    color: "#9333ea",
    preview: "Отлично, спасибо за ответ 😊",
    time: "Пн",
    unread: 0,
    online: true,
  },
];

export default function ChatsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = FAKE_CHATS.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Left panel — chat list */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <h1 className="font-playfair text-lg font-semibold">Чаты с клиентами</h1>
          <p className="text-xs text-muted-foreground">Все диалоги через Telegram-бот</p>
        </div>

        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => setSelected(chat.id)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                selected === chat.id && "bg-primary/5 hover:bg-primary/5",
              )}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: chat.color }}
                >
                  {chat.avatar}
                </div>
                {chat.online && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium">{chat.name}</span>
                  <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
                    {chat.time}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs text-muted-foreground">{chat.preview}</p>
                  {chat.unread > 0 && (
                    <span className="ml-1 flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </p>
          )}
        </div>

        {/* Coming soon banner */}
        <div className="border-t border-border bg-muted/20 p-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <span className="text-[11px] font-medium text-primary">
              🔒 Функция в разработке
            </span>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Данные выше — демонстрация интерфейса
            </p>
          </div>
        </div>
      </aside>

      {/* Right panel — empty state */}
      <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-background p-8 text-center">
        <div className="rounded-2xl border border-dashed border-border p-10">
          <MessageSquare
            className="mx-auto mb-4 text-muted-foreground/20"
            style={{ width: 70, height: 70 }}
          />
          <h2 className="font-playfair text-xl font-semibold">Live-чат в разработке</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Скоро здесь появится возможность писать клиентам напрямую через Telegram-бот прямо
            из этого окна.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button asChild>
              <Link href="/clients">
                <Users className="mr-2 h-4 w-4" />
                Написать клиенту
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Пока можно найти клиента в базе и написать ему вручную
            </p>
          </div>
        </div>

        {/* Feature roadmap hint */}
        <div className="flex flex-wrap justify-center gap-3">
          {[
            "Прямые сообщения через бота",
            "История переписки",
            "Шаблоны быстрых ответов",
            "Метки и фильтры",
          ].map((feature) => (
            <span
              key={feature}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
            >
              {feature}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
