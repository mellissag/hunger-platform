"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/api";
import type { SalonBundle } from "@/types/admin-api";

const LANGS = ["en", "ru", "uk", "bg"] as const;

export function PromptView() {
  const t = useTranslations("pages.ai");
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof LANGS)[number]>("en");
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState<string>("");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const q = useQuery({
    queryKey: ["salon-bundle"],
    queryFn: () => apiJson<SalonBundle>("/salon"),
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<SalonBundle>("/salon", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (d) => {
      qc.setQueryData(["salon-bundle"], d);
      toast.success("OK");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !q.data) return <p className="text-sm text-muted-foreground">…</p>;
  const settings = q.data.settings;
  const prompts = settings.ai_system_prompt ?? {};
  const integrations = (settings.integrations ?? {}) as Record<string, string>;
  const savedGeminiKey = integrations.ai_api_key ?? "";
  const savedGroqKey = integrations.groq_api_key ?? "";
  const savedProvider = integrations.ai_provider ?? "gemini";
  const activeProvider = selectedProvider || savedProvider;

  function maskKey(key: string, show: boolean): string {
    if (!key) return "";
    if (show) return key;
    return `${key.slice(0, 6)}${"•".repeat(Math.min(20, key.length - 6))}${key.slice(-4)}`;
  }

  function handleSaveKeys() {
    patch.mutate({
      settings: {
        integrations: {
          ...integrations,
          ai_provider: activeProvider,
          ...(geminiKeyInput.trim() ? { ai_api_key: geminiKeyInput.trim() } : {}),
          ...(groqKeyInput.trim() ? { groq_api_key: groqKeyInput.trim() } : {}),
        },
      },
    });
    setGeminiKeyInput("");
    setGroqKeyInput("");
  }

  return (
    <div className="space-y-6">
      {/* ── AI Provider & Keys ── */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider & API Keys</CardTitle>
          <CardDescription>
            Choose an AI provider and enter API keys. Keys are stored securely in the database.
            Gemini key is also used for knowledge base embeddings (RAG).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider selector */}
          <div className="space-y-1">
            <Label>Active Provider</Label>
            <select
              value={activeProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="gemini">Google Gemini (gemini-2.5-flash-lite)</option>
              <option value="groq">Groq (Llama 3.3 — free tier)</option>
              <option value="openai">OpenAI (ChatGPT)</option>
            </select>
          </div>

          {/* Gemini key */}
          <div className="space-y-1 rounded-lg border p-3">
            <Label className="text-sm font-semibold">Gemini API Key</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Required for knowledge base embeddings. Also used for generation when Gemini is active provider.
            </p>
            {savedGeminiKey && !geminiKeyInput && (
              <p className="text-xs text-muted-foreground">
                Current: <span className="font-mono">{maskKey(savedGeminiKey, showGeminiKey)}</span>{" "}
                <button type="button" className="underline text-primary text-xs" onClick={() => setShowGeminiKey((v) => !v)}>
                  {showGeminiKey ? "hide" : "show"}
                </button>
              </p>
            )}
            <Input
              type="password"
              placeholder={savedGeminiKey ? "Enter new key to replace…" : "AIza..."}
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              className="font-mono text-sm"
            />
            {savedGeminiKey ? (
              <p className="text-xs text-green-700">✓ Configured</p>
            ) : (
              <p className="text-xs text-yellow-700">⚠ Not set</p>
            )}
          </div>

          {/* Groq key */}
          <div className="space-y-1 rounded-lg border p-3">
            <Label className="text-sm font-semibold">Groq API Key</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Required when Groq is selected as active provider. Get a free key at{" "}
              <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline">console.groq.com</a>.
            </p>
            {savedGroqKey && !groqKeyInput && (
              <p className="text-xs text-muted-foreground">
                Current: <span className="font-mono">{maskKey(savedGroqKey, showGroqKey)}</span>{" "}
                <button type="button" className="underline text-primary text-xs" onClick={() => setShowGroqKey((v) => !v)}>
                  {showGroqKey ? "hide" : "show"}
                </button>
              </p>
            )}
            <Input
              type="password"
              placeholder={savedGroqKey ? "Enter new key to replace…" : "gsk_..."}
              value={groqKeyInput}
              onChange={(e) => setGroqKeyInput(e.target.value)}
              className="font-mono text-sm"
            />
            {savedGroqKey ? (
              <p className="text-xs text-green-700">✓ Configured</p>
            ) : (
              <p className="text-xs text-yellow-700">⚠ Not set</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSaveKeys}
              disabled={patch.isPending}
            >
              Save Provider & Keys
            </Button>
          </div>

          {!savedGeminiKey && (
            <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
              ⚠️ Gemini key is required for knowledge base search. AI consultant will not work without it.
            </p>
          )}
          {activeProvider === "groq" && !savedGroqKey && (
            <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
              ⚠️ Groq is selected as provider but no Groq API key is configured.
            </p>
          )}
          {savedGeminiKey && (activeProvider !== "groq" || savedGroqKey) && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-800 border border-green-200">
              ✓ AI consultant is active using {activeProvider === "groq" ? "Groq (Llama 3.3)" : activeProvider === "openai" ? "OpenAI" : "Google Gemini"}.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("promptTitle")}</CardTitle>
          <CardDescription>{t("variablesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 border-b pb-2">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                className={`text-sm ${tab === l ? "font-semibold" : "text-muted-foreground"}`}
                onClick={() => setTab(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <Textarea
            rows={14}
            className="font-mono text-sm"
            defaultValue={(prompts as Record<string, string>)[tab] ?? ""}
            id={`prompt-${tab}`}
          />
          <Button
            type="button"
            onClick={() => {
              const v = (document.getElementById(`prompt-${tab}`) as HTMLTextAreaElement).value;
              patch.mutate({
                settings: {
                  ai_system_prompt: { [tab]: v },
                },
              });
            }}
            disabled={patch.isPending}
          >
            Save ({tab})
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("fewShot")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            className="font-mono text-xs"
            id="few-json"
            defaultValue={JSON.stringify(settings.ai_few_shot_examples ?? [], null, 2)}
          />
          <Button
            className="mt-2"
            type="button"
            onClick={() => {
              try {
                const raw = (document.getElementById("few-json") as HTMLTextAreaElement).value;
                patch.mutate({ settings: { ai_few_shot_examples: JSON.parse(raw) } });
              } catch {
                toast.error("Invalid JSON");
              }
            }}
          >
            Save few-shot
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model & toggles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Model id</Label>
            <Input
              id="ai-model"
              defaultValue={settings.ai_model ?? ""}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ai-on"
              defaultChecked={settings.ai_enabled}
              className="h-4 w-4"
            />
            <Label htmlFor="ai-on">{t("aiEnabled")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ai-book"
              defaultChecked={settings.ai_allow_booking}
              className="h-4 w-4"
            />
            <Label htmlFor="ai-book">{t("allowBooking")}</Label>
          </div>
          <div>
            <Label>{t("temperature")}</Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              defaultValue={String(settings.ai_temperature ?? 0.7)}
              id="ai-temp"
              className="mt-2 w-full"
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              patch.mutate({
                settings: {
                  ai_model: (document.getElementById("ai-model") as HTMLInputElement).value || null,
                  ai_enabled: (document.getElementById("ai-on") as HTMLInputElement).checked,
                  ai_allow_booking: (document.getElementById("ai-book") as HTMLInputElement)
                    .checked,
                  ai_temperature: Number.parseFloat(
                    (document.getElementById("ai-temp") as HTMLInputElement).value,
                  ),
                },
              });
            }}
            disabled={patch.isPending}
          >
            Save options
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
