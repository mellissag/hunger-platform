export type PrivacySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type PrivacyPolicyDocument = {
  locale: "en" | "ru" | "uk" | "bg";
  title: string;
  subtitle: string;
  lastUpdated: string;
  backHome: string;
  contactHeading: string;
  contactHint: string;
  sections: PrivacySection[];
};
