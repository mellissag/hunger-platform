/**
 * Tailwind/shadcn theme tokens on :root are bare HSL channels (e.g. "37 53% 40%").
 * Inline `style={{}}` must wrap them with hsl(), otherwise the browser drops the declaration.
 */
export const tc = {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  card: "hsl(var(--card))",
  border: "hsl(var(--border))",
  primary: "hsl(var(--primary))",
  primaryFg: "hsl(var(--primary-foreground))",
  muted: "hsl(var(--muted))",
  mutedFg: "hsl(var(--muted-foreground))",
} as const;
