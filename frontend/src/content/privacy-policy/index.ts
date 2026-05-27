import { privacyPolicyBg } from "./bg";
import { privacyPolicyEn } from "./en";
import { privacyPolicyRu } from "./ru";
import { privacyPolicyUk } from "./uk";
import type { PrivacyPolicyDocument } from "./types";

const locales = ["en", "ru", "uk", "bg"] as const;
export type PrivacyLocale = (typeof locales)[number];

const byLocale: Record<PrivacyLocale, PrivacyPolicyDocument> = {
  en: privacyPolicyEn,
  ru: privacyPolicyRu,
  uk: privacyPolicyUk,
  bg: privacyPolicyBg,
};

export function getPrivacyPolicy(locale: string): PrivacyPolicyDocument {
  if (locale in byLocale) return byLocale[locale as PrivacyLocale];
  return privacyPolicyEn;
}

export function privacyContactEmail(hostname: string): string {
  const host = hostname.replace(/^www\./, "");
  return `privacy@${host}`;
}
