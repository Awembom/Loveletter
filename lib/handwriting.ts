// Handwriting engine: font loading, text layout and stroke timing.
//
// Everything except `loadFont` is pure and deterministic: the same input
// (including the letter ID used as random seed) always yields the same strokes.
//
// Font data comes from single-stroke (centre-line) Hershey/EMS fonts converted
// by scripts/convert-fonts.mjs: { [char]: [advance, [[x0,y0,x1,y1,...], ...]] }
// in font units (1000/em, y up, baseline at 0).

import { STYLES, type Style } from "./constants";

export type FontData = Record<string, [number, number[][]]>;

/** Load a font's JSON lazily so each style is its own small chunk. */
export async function loadFont(style: Style): Promise<FontData> {
  const mod =
    style === "script"
      ? await import("./fonts/script.json")
      : await import("./fonts/allure.json");
  return mod.default as unknown as FontData;
}

export function isStyle(value: unknown): value is Style {
  return typeof value === "string" && (STYLES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

/** FNV-1a hash of a string, used to seed the generator. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, good enough for visual jitter. Returns [0, 1). */
function makeRng(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Text normalisation                                                  */
/* ------------------------------------------------------------------ */

// Characters the fonts lack, mapped to ones they have.
const CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "„": '"', "‟": '"', "″": '"',
  "…": "...",
  "‐": "-", "‑": "-", "‒": "-", "−": "-",
  "•": "·",
  "œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE",
  "\t": " ", " ": " ", " ": " ", " ": " ", " ": " ",
};

/** Map one character to something the font can draw ("" if impossible). */
function normalizeChar(ch: string, font: FontData): string {
  if (font[ch]) return ch;
  const mapped = CHAR_MAP[ch];
  if (mapped !== undefined) return [...mapped].filter((c) => font[c]).join("");
  // Fallback: strip accents (e.g. "ő" -> "o"). Emoji and the like become "".
  const stripped = ch.normalize("NFD").replace(/\p{M}/gu, "");
  return [...stripped].every((c) => font[c]) ? stripped : "";
}

// Placeholder for a character we couldn't draw, removed again below.
const DROPPED = "\u0000";

/** Normalise a whole text, keeping line breaks. Never throws. */
export function normalizeText(text: string, font: FontData): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      [...line]
        .map((ch) => normalizeChar(ch, font) || (ch.trim() ? DROPPED : ""))
        .join("")
        // A dropped emoji takes its leading space with it when followed by
        // a space, punctuation or line end: "love 💌, x" -> "love, x".
        .replace(/ ?\u0000+(?=[ ,.;:!?)]|$)/g, "")
        .replace(/\u0000/g, ""),
    )
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Why the pen pauses before a stroke. Longer pauses after punctuation and
 * line ends make the writing feel like a person thinking.
 */
export type Gap = "start" | "stroke" | "glyph" | "word" | "comma" | "stop" | "line" | "para";

/*
 * Writing speed. These two numbers are the knobs to turn:
 *   NIB_SPEED   - how fast the nib moves while drawing, in em of ink per
 *                 second. Lower = slower writing. (Was 22, then 14.)
 *   PAUSE_SCALE - multiplies every pause below. Higher = longer pauses
 *                 between letters, words and sentences. (Was 1, then 1.4.)
 * At these values the pen writes about 3 letters a second, roughly 35
 * words a minute: slower than even a slow reader, so the writing never
 * runs ahead of them. Long letters are NOT sped up; they simply take longer.
 */
const NIB_SPEED = 9;
const PAUSE_SCALE = 1.8;

// Base pause (ms) before a stroke, by reason.
const GAP_MS: Record<Gap, number> = {
  start: 400 * PAUSE_SCALE,
  stroke: 25 * PAUSE_SCALE,
  glyph: 30 * PAUSE_SCALE,
  word: 130 * PAUSE_SCALE,
  comma: 300 * PAUSE_SCALE,
  stop: 480 * PAUSE_SCALE,
  line: 380 * PAUSE_SCALE,
  para: 650 * PAUSE_SCALE,
};

const longerGap = (a: Gap, b: Gap): Gap => (GAP_MS[a] >= GAP_MS[b] ? a : b);

export type Stroke = {
  /** SVG path data in page coordinates. */
  d: string;
  /** Flat [x0, y0, x1, y1, ...] in page coordinates. */
  pts: number[];
  /** Cumulative length at each point; cum[0] = 0. */
  cum: number[];
  length: number;
  opacity: number;
  gap: Gap;
};

export type LetterLayout = {
  width: number;
  height: number;
  fontSize: number;
  strokeWidth: number;
  /** y of every ruled line (the baselines, plus a few spare lines). */
  rules: number[];
  strokes: Stroke[];
};

export type LetterContent = {
  /** Seed for the jitter; use the letter ID. */
  seed: string;
  date?: string;
  recipient?: string | null;
  body: string;
  /** Sign-off line above the sender's name, e.g. "Forever yours,". */
  closing?: string | null;
  sender?: string | null;
};

type Align = "left" | "right";

/** Per-word random variation, so the writing doesn't look mechanical. */
type WordStyle = { scale: number; slant: number; jitter: number; opacity: number };

type Piece = { text: string; width: number; style: WordStyle };

type Line = { pieces: Piece[]; align: Align; gap: Gap };

/** Font size from the available width: ~26-30 characters per line on phones. */
function pickFontSize(width: number): number {
  return Math.max(22, Math.min(38, width / 13));
}

/** Width of a text in px at a given em size. Missing glyphs count as 0. */
function measure(text: string, font: FontData, size: number): number {
  let w = 0;
  for (const ch of text) w += (font[ch]?.[0] ?? 0) * size / 1000;
  return w;
}

/**
 * Split a paragraph into lines no wider than maxW.
 * Words longer than a full line are broken character by character.
 */
function wrapParagraph(
  words: Piece[],
  maxW: number,
  spaceW: number,
  font: FontData,
  fontSize: number,
): Piece[][] {
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let lineW = 0;

  const push = (p: Piece) => {
    if (line.length > 0 && lineW + spaceW + p.width > maxW) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
    lineW += (line.length > 0 ? spaceW : 0) + p.width;
    line.push(p);
  };

  for (const word of words) {
    if (word.width <= maxW) {
      push(word);
      continue;
    }
    // Too long for any line: cut into chunks that each fit.
    const size = fontSize * word.style.scale;
    let chunk = "";
    for (const ch of word.text) {
      if (chunk && measure(chunk + ch, font, size) > maxW) {
        push({ text: chunk, width: measure(chunk, font, size), style: word.style });
        chunk = "";
      }
      chunk += ch;
    }
    if (chunk) push({ text: chunk, width: measure(chunk, font, size), style: word.style });
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Turn the letter content into lines, preserving the sender's line breaks. */
function buildLines(
  content: LetterContent,
  font: FontData,
  fontSize: number,
  maxW: number,
  rng: () => number,
): Line[] {
  const blocks: { text: string; align: Align }[] = [];
  if (content.date) blocks.push({ text: content.date, align: "right" }, { text: "", align: "left" });
  if (content.recipient) blocks.push({ text: `Dear ${content.recipient},`, align: "left" }, { text: "", align: "left" });
  blocks.push({ text: content.body, align: "left" });
  // Sign-off: a blank line, then the closing and the name, right-aligned.
  if (content.closing || content.sender) blocks.push({ text: "", align: "left" });
  if (content.closing) blocks.push({ text: content.closing, align: "right" });
  if (content.sender) blocks.push({ text: content.sender, align: "right" });

  const spaceW = (font[" "]?.[0] ?? 300) * fontSize / 1000;
  const lines: Line[] = [];
  // Pause before the next written line: "para" after a blank line or block.
  let nextGap: Gap = "start";

  for (const block of blocks) {
    for (const para of normalizeText(block.text, font).split("\n")) {
      const words: Piece[] = para
        .split(" ")
        .filter(Boolean)
        .map((text) => {
          const style: WordStyle = {
            scale: 1 + (rng() - 0.5) * 0.07,
            slant: (rng() - 0.5) * 0.08,
            jitter: (rng() - 0.5) * 0.05,
            opacity: 0.8 + rng() * 0.2,
          };
          return { text, width: measure(text, font, fontSize * style.scale), style };
        });

      if (words.length === 0) {
        // Blank line: keep the space, and pause longer before what follows.
        lines.push({ pieces: [], align: block.align, gap: "line" });
        if (nextGap !== "start") nextGap = "para";
        continue;
      }
      for (const pieces of wrapParagraph(words, maxW, spaceW, font, fontSize)) {
        lines.push({ pieces, align: block.align, gap: nextGap });
        nextGap = "line";
      }
    }
    if (nextGap !== "start") nextGap = "para";
  }
  return lines;
}

/** Make a stroke from page-space points, with cumulative lengths. */
function makeStroke(pts: number[], opacity: number, gap: Gap): Stroke {
  // A single point (a dot) gets a tiny tail so the round cap shows.
  if (pts.length === 2) pts = [pts[0], pts[1], pts[0] + 0.6, pts[1] + 0.3];
  const cum = [0];
  let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
  for (let i = 2; i < pts.length; i += 2) {
    const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    cum.push(cum[cum.length - 1] + seg);
    d += `L${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)}`;
  }
  const length = Math.max(cum[cum.length - 1], 0.5);
  return { d, pts, cum, length, opacity, gap };
}

/**
 * Lay out a letter for a given container width (px).
 * Returns ordered strokes in page coordinates, ready to animate.
 */
export function layoutLetter(content: LetterContent, font: FontData, width: number): LetterLayout {
  const rng = makeRng(content.seed);
  const fontSize = pickFontSize(width);
  const padX = Math.max(14, fontSize * 0.7);
  const maxW = width - padX * 2;
  const lineHeight = fontSize * 1.35;
  const top = fontSize * 1.3;

  const lines = buildLines(content, font, fontSize, maxW, rng);
  const spaceW = (font[" "]?.[0] ?? 300) * fontSize / 1000;
  const strokes: Stroke[] = [];
  const rules: number[] = [];

  lines.forEach((line, li) => {
    const baseline = top + li * lineHeight;
    rules.push(baseline);
    if (line.pieces.length === 0) return;

    // Gentle wave along the line so the baseline isn't ruler-straight.
    const wavePhase = rng() * Math.PI * 2;
    const waveAmp = fontSize * 0.035;

    const lineW = line.pieces.reduce((w, p) => w + p.width, 0) + spaceW * (line.pieces.length - 1);
    let penX = padX + (line.align === "right" ? Math.max(0, maxW - lineW) : 0);
    let wordGap: Gap = line.gap;

    for (const piece of line.pieces) {
      const { scale, slant, jitter, opacity } = piece.style;
      const s = (fontSize * scale) / 1000;
      const centre = penX + piece.width / 2;
      const dy = waveAmp * Math.sin(wavePhase + (centre / width) * Math.PI * 1.6) + jitter * fontSize;
      let firstInWord = true;

      for (const ch of piece.text) {
        const glyph = font[ch];
        if (!glyph) continue;
        const [adv, glyphStrokes] = glyph;
        glyphStrokes.forEach((gs, si) => {
          if (gs.length < 2) return;
          const pts: number[] = [];
          for (let i = 0; i < gs.length; i += 2) {
            const gx = gs[i];
            const gy = gs[i + 1];
            // Flip y (font y points up), apply slant and size, then place.
            pts.push(penX + (gx + gy * slant) * s, baseline + dy - gy * s);
          }
          const gap: Gap = firstInWord ? wordGap : si === 0 ? "glyph" : "stroke";
          strokes.push(makeStroke(pts, opacity, gap));
          firstInWord = false;
        });
        penX += adv * s;
      }
      penX += spaceW;

      // The next word's pause depends on how this one ended.
      const last = piece.text[piece.text.length - 1];
      wordGap = /[.!?]/.test(last) ? "stop" : /[,;:]/.test(last) ? "comma" : "word";
    }
    // If a line ends in punctuation, the next line waits for the longer pause.
    const nextLine = lines[li + 1];
    if (nextLine && wordGap !== "word") nextLine.gap = longerGap(nextLine.gap, wordGap);
  });

  // A few empty ruled lines below the text, like a real sheet.
  const extra = 2;
  for (let i = 0; i < extra; i++) rules.push(top + (lines.length + i) * lineHeight);
  const height = top + (lines.length + extra - 1) * lineHeight + fontSize;

  return {
    width,
    height,
    fontSize,
    strokeWidth: Math.max(1.1, fontSize * 0.055),
    rules,
    strokes,
  };
}

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

export type Timeline = {
  /** When each stroke starts drawing (ms from start). */
  starts: Float64Array;
  /** How long each stroke takes to draw (ms). */
  durations: Float64Array;
  total: number;
};

/**
 * Plan when each stroke is drawn: steady nib speed while drawing, with a
 * pause before each stroke based on its gap. The pace is the same however
 * long the letter is, so a slow reader can always keep up.
 */
export function planTimeline(layout: LetterLayout): Timeline {
  const n = layout.strokes.length;
  const starts = new Float64Array(n);
  const durations = new Float64Array(n);
  // Script glyphs use ~1.7-1.9 em of ink per letter, so at NIB_SPEED 9
  // with lifts this writes roughly 3 letters a second.
  const pxPerMs = (layout.fontSize * NIB_SPEED) / 1000;

  let t = 0;
  layout.strokes.forEach((s, i) => {
    t += GAP_MS[s.gap];
    starts[i] = t;
    durations[i] = Math.max(20, s.length / pxPerMs);
    t += durations[i];
  });

  return { starts, durations, total: t };
}

/** Point at a given distance along a stroke. */
export function pointAt(stroke: Stroke, dist: number): [number, number] {
  const { pts, cum } = stroke;
  if (dist <= 0) return [pts[0], pts[1]];
  // Binary search for the segment containing `dist`.
  let lo = 0;
  let hi = cum.length - 1;
  if (dist >= cum[hi]) return [pts[hi * 2], pts[hi * 2 + 1]];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dist) lo = mid;
    else hi = mid;
  }
  const f = (dist - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [
    pts[lo * 2] + (pts[hi * 2] - pts[lo * 2]) * f,
    pts[lo * 2 + 1] + (pts[hi * 2 + 1] - pts[lo * 2 + 1]) * f,
  ];
}
