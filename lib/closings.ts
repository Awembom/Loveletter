// Romantic sign-offs written just above the sender's name on love letters.
// Each letter gets one, picked from its ID: different letters get different
// lines, but the same letter always ends the same way.
//
// Keep them short (they're right-aligned and should fit one line on a
// phone), plain ASCII, and ending with a comma, like a real sign-off.

import { hashString } from "./handwriting";

const LOVE_CLOSINGS = [
  "Forever yours,",
  "All my love, always,",
  "Yours, heart and soul,",
  "With every heartbeat,",
  "Endlessly yours,",
  "To the moon and back,",
  "Till the stars go out,",
  "Always and forever yours,",
  "Still falling for you,",
  "My heart is yours,",
  "Yours, every tomorrow,",
  "With all the love I have,",
  "Forever your love,",
  "With a kiss on every word,",
  "Adoring you always,",
  "Your love, always,",
  "In this life and the next,",
  "Wrapped in all my love,",
  "Head over heels for you,",
  "Holding you in my heart,",
  "Love you more than words,",
  "Yours, now and always,",
  "Every heartbeat is yours,",
  "Your favourite person,",
];

/** The love-letter sign-off for a given letter ID. */
export function pickLoveClosing(seed: string): string {
  return LOVE_CLOSINGS[hashString(`${seed}:closing`) % LOVE_CLOSINGS.length];
}
