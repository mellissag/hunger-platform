import type { PrivacyPolicyDocument } from "./types";

export const privacyPolicyEn: PrivacyPolicyDocument = {
  locale: "en",
  title: "Privacy Policy",
  subtitle: "Hunger Beauty — salon management platform",
  lastUpdated: "22 May 2026",
  backHome: "Back to home",
  contactHeading: "Privacy contact",
  contactHint:
    "Use the email below for access, correction, deletion requests, consent withdrawal, or complaints about processing.",
  sections: [
    {
      id: "controller",
      title: "1. Data controller",
      paragraphs: [
        "This policy describes how personal data is processed within the Hunger Beauty software (the “Service”), deployed for a beauty salon and available at test-adm.tech and related domains.",
        "For salon clients, the data controller is the owner of that Service instance (the salon / sole trader / company operating the system). Platform technical support may act as a processor on the controller’s instructions.",
        "For client data matters, contact the salon first; for the Service itself, use the contact email at the end of this document.",
      ],
    },
    {
      id: "scope",
      title: "2. Who this applies to",
      paragraphs: ["This policy covers everyone whose data is processed through the Service, including:"],
      bullets: [
        "salon clients in the Telegram Mini App and messengers (Telegram, WhatsApp, Instagram Direct);",
        "staff and administrators using the web admin panel;",
        "visitors of public website pages (including this policy page).",
      ],
    },
    {
      id: "collected",
      title: "3. Data we collect",
      paragraphs: ["Depending on how you use the Service, we may process:"],
      bullets: [
        "messenger account identifiers (Telegram user ID, Instagram-scoped ID, WhatsApp number);",
        "name, phone, email, interface language, date of birth (if provided during registration or booking);",
        "message history and support conversations with the bot and admins;",
        "appointment data: services, specialist, date and time, visit status, notes;",
        "loyalty data: points, referral code, accrual history;",
        "technical data: IP address, user-agent, API request logs, admin session cookies;",
        "content you voluntarily send to the bot (including photos for consultations, if enabled).",
      ],
    },
    {
      id: "purposes",
      title: "4. Purposes of processing",
      paragraphs: ["Personal data is used only for legitimate salon and Service purposes:"],
      bullets: [
        "accepting and managing online bookings, reminders and confirmations;",
        "consultations and replies via chat bot and AI assistant (based on the salon knowledge base);",
        "client profile, visit history and loyalty management;",
        "communication in your chosen messenger;",
        "security, staff audit logs, abuse prevention;",
        "compliance with applicable law.",
      ],
    },
    {
      id: "legal-basis",
      title: "5. Legal basis (GDPR)",
      paragraphs: [
        "Processing is based on: contract or pre-contract steps (booking); legitimate interests (CRM, security, service improvement); consent (marketing, optional fields); legal obligations.",
        "You may withdraw consent at any time without affecting lawfulness of processing before withdrawal.",
      ],
    },
    {
      id: "third-parties",
      title: "6. Third parties",
      paragraphs: [
        "We do not sell data. Sharing occurs only with providers required to run the Service:",
      ],
      bullets: [
        "Meta Platforms (Instagram / Facebook) — Instagram Direct via official Messaging API;",
        "Telegram — Mini App, bot, notifications;",
        "Meta / WhatsApp Business API — WhatsApp messages (if enabled);",
        "Google (Gemini) — AI assistant replies; only dialogue context and salon knowledge base content are sent;",
        "hosting provider (VPS) for database and file storage;",
        "payment and SMS providers — only if the salon enabled those integrations.",
      ],
    },
    {
      id: "retention",
      title: "7. Retention",
      paragraphs: [
        "Client data is kept while the relationship with the salon exists or as needed for accounting and disputes. Chat messages and logs may be retained for a limited period per salon settings and backups.",
        "On deletion requests, data is erased or anonymised unless law requires retention (e.g. accounting).",
      ],
    },
    {
      id: "rights",
      title: "8. Your rights",
      paragraphs: ["Under GDPR and applicable national law you may:"],
      bullets: [
        "access your data and obtain a copy;",
        "rectify inaccurate data;",
        "request erasure where there is no lawful reason to keep processing;",
        "restrict processing or object;",
        "data portability in a structured format;",
        "lodge a complaint with your supervisory authority.",
      ],
    },
    {
      id: "deletion",
      title: "9. Data deletion",
      paragraphs: [
        "To request deletion, email the address below with subject “Personal data deletion” and include: your name and how to identify you (Telegram / phone / Instagram).",
        "The salon will verify identity and complete deletion within a reasonable time (typically up to 30 calendar days). Recovery may be impossible after deletion.",
        "To revoke Instagram app access, use Meta settings: Account Center → Apps and websites.",
      ],
    },
    {
      id: "security",
      title: "10. Security",
      paragraphs: [
        "We use HTTPS, restricted admin access, password hashing, role-based staff permissions, and database backups.",
        "No internet transmission is perfectly secure; we apply reasonable measures to reduce risk.",
      ],
    },
    {
      id: "children",
      title: "11. Children",
      paragraphs: [
        "The Service is not intended for users under 16 without parental consent. Contact us if you believe a child’s data was collected without consent.",
      ],
    },
    {
      id: "changes",
      title: "12. Changes",
      paragraphs: [
        "We may update this policy. The current version is always at /privacy with the “Last updated” date.",
        "Material changes may also be communicated via the salon or Mini App.",
      ],
    },
  ],
};
