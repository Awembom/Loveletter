// One-off converter: hersheytext single-stroke SVG fonts -> compact JSON.
//
// Output shape: { [char]: [advanceWidth, [[x0,y0,x1,y1,...], ...strokes]] }
// Coordinates stay in font units (1000/em, y up, baseline 0), rounded to ints.
//
// Usage: npm run convert-fonts

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "hersheytext", "svg_fonts");
const outDir = join(root, "lib", "fonts");

const FONTS = {
  allure: "EMSAllure.svg",
  script: "HersheyScript1.svg",
};

/** Decode the few XML entities that appear in glyph `unicode` attributes. */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Parse an M/L-only path into an array of flat point lists. */
function parsePath(d) {
  const strokes = [];
  let current = null;
  const re = /([ML])\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(d))) {
    const x = Math.round(parseFloat(m[2]));
    const y = Math.round(parseFloat(m[3]));
    if (m[1] === "M" || !current) {
      current = [x, y];
      strokes.push(current);
    } else {
      current.push(x, y);
    }
  }
  return strokes;
}

function convert(file) {
  const svg = readFileSync(join(srcDir, file), "utf8");
  const defaultAdv = Number(attr(svg.match(/<font\s[^>]*>/)[0], "horiz-adv-x"));
  const out = {};
  for (const tag of svg.match(/<glyph\s[^>]*>/g) ?? []) {
    const raw = attr(tag, "unicode");
    if (raw == null) continue;
    const ch = decodeEntities(raw);
    if ([...ch].length !== 1) continue; // skip ligatures
    const adv = Math.round(Number(attr(tag, "horiz-adv-x") ?? defaultAdv));
    const d = attr(tag, "d");
    out[ch] = [adv, d ? parsePath(d) : []];
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const [name, file] of Object.entries(FONTS)) {
  const data = convert(file);
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data));
  console.log(`${name}: ${Object.keys(data).length} glyphs`);
}
