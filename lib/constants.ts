// Limits and options shared by the browser and the server.
// Keep in sync with the checks in supabase/schema.sql.

export const MAX_BODY = 2000;
export const MAX_NAME = 60;

export const STYLES = ["allure", "script"] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABELS: Record<Style, string> = {
  allure: "Flowing script",
  script: "Classic cursive",
};

// What kind of letter it is. Sets the look and music on both pages.
export const THEMES = ["love", "friend"] as const;
export type Theme = (typeof THEMES)[number];

/** Copy that differs between a love letter and a letter to a friend. */
export const THEME_TEXT: Record<Theme, {
  label: string;
  hint: string;
  heading: string;
  kind: string;
  recipientPlaceholder: string;
  stylePreview: string;
}> = {
  love: {
    label: "A love letter",
    hint: "For your partner, or someone you love",
    heading: "Write a love letter",
    kind: "love letter",
    recipientPlaceholder: "Their name, or “my love”",
    stylePreview: "My dearest love",
  },
  friend: {
    label: "A letter to a friend",
    hint: "For friends and family",
    heading: "Write a letter to a friend",
    kind: "letter",
    recipientPlaceholder: "Their name",
    stylePreview: "Dear friend",
  },
};

/** Count characters the way Postgres char_length does (code points). */
export const charCount = (s: string) => [...s].length;
