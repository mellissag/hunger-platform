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
  const [keyInput, setKeyInput] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
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

  // Current saved key for whichever provider is active
  const currentSavedKey =
    activeProvider === "groq" ? savedGroqKey : savedGeminiKey;

  const keyPlaceholder =
    activeProvider === "groq" ? "gsk_..." : activeProvider === "openai" ? "sk-..." : "AIza...";

  function maskKey(key: string, show: boolean): string {
    if (!key) return "";
    if (show) return key;
    return `${key.slice(0, 6)}${"•".repeat(Math.min(20, key.length - 6))}${key.slice(-4)}`;
  }

  function handleSaveKeys() {
    const trimmed = keyInput.trim();
    const keyField = activeProvider === "groq" ? "groq_api_key" : "ai_api_key";
    patch.mutate({
      settings: {
        integrations: {
          ...integrations,
          ai_provider: activeProvider,
          ...(trimmed ? { [keyField]: trimmed } : {}),
        },
      },
    });
    setKeyInput("");
    setShowKey(false);
  }

  return (
    <div className="space-y-6">
      {/* ── AI Provider & Key ── */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider & API Key</CardTitle>
          <CardDescription>
            Select a provider, paste its API key and click Save. Keys for all providers are kept — switch freely without re-entering.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider selector */}
          <div className="space-y-1">
            <Label>Provider</Label>
            <select
              value={activeProvider}
              onChange={(e) => { setSelectedProvider(e.target.value); setKeyInput(""); setShowKey(false); }}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="gemini">Google Gemini (gemini-2.5-flash-lite)</option>
              <option value="groq">Groq — Llama 3.3 70B (free tier)</option>
              <option value="openai">OpenAI (ChatGPT)</option>
            </select>
          </div>

          {/* Single key field for active provider */}
          <div className="space-y-1">
            <Label>API Key for {activeProvider === "groq" ? "Groq" : activeProvider === "openai" ? "OpenAI" : "Gemini"}</Label>
            {currentSavedKey && !keyInput && (
              <p className="text-xs text-muted-foreground">
                Saved: <span className="font-mono">{maskKey(currentSavedKey, showKey)}</span>{" "}
                <button type="button" className="underline text-primary text-xs" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? "hide" : "show"}
                </button>
              </p>
            )}
            <Input
              type="password"
              placeholder={currentSavedKey ? "Enter new key to replace…" : keyPlaceholder}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={handleSaveKeys} disabled={patch.isPending}>
              Save
            </Button>
            {currentSavedKey && (
              <Button
                type="button"
                variant="outline"
                disabled={patch.isPending}
                onClick={() => {
                  const keyField = activeProvider === "groq" ? "groq_api_key" : "ai_api_key";
                  patch.mutate({ settings: { integrations: { ...integrations, [keyField]: "" } } });
                }}
              >
                Remove key
              </Button>
            )}
          </div>

          {/* Status */}
          {currentSavedKey ? (
            <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-800 border border-green-200">
              ✓ Active: {activeProvider === "groq" ? "Groq Llama 3.3" : activeProvider === "openai" ? "OpenAI" : "Google Gemini"}
              {activeProvider === "groq" && !savedGeminiKey && (
                <span className="block mt-1 text-yellow-700">⚠ Add a Gemini key too — it is required for knowledge base search.</span>
              )}
            </p>
          ) : (
            <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
              ⚠️ No API key for {activeProvider === "groq" ? "Groq" : activeProvider === "openai" ? "OpenAI" : "Gemini"}. AI consultant will not work.
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
