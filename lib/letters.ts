import "server-only";
import { getSupabase } from "./supabase";
import { decryptField, encryptField } from "./crypto";
import { MAX_BODY, MAX_NAME, STYLES, THEMES, charCount, type Style, type Theme } from "./constants";

export type Letter = {
  id: string;
  recipient: string | null;
  sender: string | null;
  body: string;
  style: Style;
  theme: Theme;
  created_at: string;
};

export type NewLetter = Pick<Letter, "recipient" | "sender" | "body" | "style" | "theme">;

// No 0/O/o, 1/l/I: easy to read aloud or retype from a screenshot.
const ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const ID_LENGTH = 10;
const ID_PATTERN = new RegExp(`^[${ID_ALPHABET}]{${ID_LENGTH}}$`);

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Random ID using rejection sampling so every character is equally likely. */
function generateId(): string {
  const limit = 256 - (256 % ID_ALPHABET.length);
  let id = "";
  while (id.length < ID_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH * 2));
    for (const b of bytes) {
      if (b < limit && id.length < ID_LENGTH) id += ID_ALPHABET[b % ID_ALPHABET.length];
    }
  }
  return id;
}

/** Trim a name; empty becomes null. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/\s+/g, " ");
  return v ? v : null;
}

/**
 * Validate untrusted input. Returns the cleaned letter or a message
 * that can be shown to the sender as is.
 */
export function validateLetter(input: unknown): { ok: true; letter: NewLetter } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "The letter is missing." };
  const raw = input as Record<string, unknown>;

  const body = typeof raw.body === "string" ? raw.body.replace(/\r\n?/g, "\n").trim() : "";
  if (!body) return { ok: false, error: "Please write a message before sending." };
  if (charCount(body) > MAX_BODY) {
    return { ok: false, error: `Your message is too long: ${charCount(body)} characters, the limit is ${MAX_BODY}.` };
  }

  const recipient = cleanName(raw.recipient);
  const sender = cleanName(raw.sender);
  if (recipient && charCount(recipient) > MAX_NAME) {
    return { ok: false, error: `The recipient's name can be at most ${MAX_NAME} characters.` };
  }
  if (sender && charCount(sender) > MAX_NAME) {
    return { ok: false, error: `Your name can be at most ${MAX_NAME} characters.` };
  }

  const style = raw.style ?? "allure";
  if (!(STYLES as readonly unknown[]).includes(style)) {
    return { ok: false, error: "Please choose one of the handwriting styles." };
  }

  // No default on purpose: the sender must say who the letter is for.
  if (!(THEMES as readonly unknown[]).includes(raw.theme)) {
    return { ok: false, error: "Please choose whether this is a love letter or a letter to a friend." };
  }

  return { ok: true, letter: { body, recipient, sender, style: style as Style, theme: raw.theme as Theme } };
}

// Text fields that are encrypted at rest. Style and theme stay readable.
const SECRET_FIELDS = ["body", "recipient", "sender"] as const;

/** Insert a letter and return its new ID. Retries on the (rare) ID clash. */
export async function createLetter(letter: NewLetter): Promise<string> {
  const db = getSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = generateId();
    // Encrypt per attempt: each ciphertext is bound to its letter ID.
    const row: Record<string, string | null> = { id, style: letter.style, theme: letter.theme };
    for (const f of SECRET_FIELDS) {
      const value = letter[f];
      row[f] = value === null ? null : encryptField(value, id, f);
    }
    const { error } = await db.from("letters").insert(row);
    if (!error) return id;
    if (error.code !== "23505") throw new Error(`Insert failed: ${error.message}`);
  }
  throw new Error("Could not find a free letter ID.");
}

/** Fetch a letter by ID, or null if it doesn't exist. */
export async function getLetter(id: string): Promise<Letter | null> {
  if (!isValidId(id)) return null;
  const { data, error } = await getSupabase()
    .from("letters")
    .select("id, recipient, sender, body, style, theme, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Fetch failed: ${error.message}`);
  if (!data) return null;
  const letter = data as Letter;
  for (const f of SECRET_FIELDS) {
    const value = letter[f];
    if (value !== null) letter[f] = decryptField(value, letter.id, f);
  }
  return letter;
}
