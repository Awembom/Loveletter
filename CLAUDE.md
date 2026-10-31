# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A small web app for sending handwritten-style letters.

1. A sender writes a message (optional recipient name and sender name) and gets a shareable link.
2. The recipient opens the link and sees a sealed envelope.
3. When they open it, a sheet of paper appears and a fountain pen writes the message in real time, stroke by stroke and word by word, like a letter being handwritten.

Keep it simple. This is a single-purpose app, not a platform. No accounts, no login.

## Stack

- **Next.js** (App Router, TypeScript), deployed on **Vercel**
- **Supabase** (Postgres) to store letters
- Plain CSS in `app/globals.css` (no Tailwind unless I ask for it)
- No UI component libraries; no heavy animation libraries unless there's a clear need

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # must pass before any task is considered done
npm run start
```

## Environment variables

Put these in `.env.local` locally and in Vercel project settings for production:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
LETTER_ENCRYPTION_KEY=<32 random bytes, base64>
```

Letter text (body, recipient, sender) is encrypted with AES-256-GCM in `lib/crypto.ts` before it is stored. `LETTER_ENCRYPTION_KEY` is server-only like the service role key; never change or lose it, or stored letters become unreadable. See `.env.example`.

The service role key is **server-only**. Never prefix it with `NEXT_PUBLIC_`, never import the Supabase client into a `"use client"` file, and never send it to the browser.

## Suggested structure

```
app/
  page.tsx                 # compose page (write the letter, get the link)
  l/[id]/page.tsx          # letter page (server: fetch letter, then render viewer)
  api/letters/route.ts     # POST: validate + insert, returns { id }
  not-found.tsx
  globals.css
components/
  Composer.tsx             # client: form + share panel
  LetterViewer.tsx         # client: envelope -> open -> letter
  HandwrittenLetter.tsx    # client: layout + stroke animation + pen
lib/
  supabase.ts              # server-only client (import "server-only")
  letters.ts               # validate, createLetter, getLetter
  handwriting.ts           # font loading, text layout, stroke generation
  penSound.ts              # optional Web Audio pen-scratch sound
  fonts/*.json             # converted single-stroke font data
supabase/
  schema.sql
```

## Database

```sql
create table if not exists public.letters (
  id          text primary key,
  recipient   text check (char_length(recipient) <= 60),
  sender      text check (char_length(sender) <= 60),
  body        text not null check (char_length(body) between 1 and 2000),
  style       text not null default 'allure',
  created_at  timestamptz not null default now()
);
alter table public.letters enable row level security;
-- No policies: only the server (service role) reads and writes.
```

- IDs: random 10-character strings from an unambiguous alphabet (no 0/O, 1/l/I), generated with `crypto.getRandomValues`. Validate the ID format before querying.
- All reads and writes go through server code (route handler and server component).

## The handwriting animation (core of the app)

This is the part that matters most. Get it right before polishing anything else.

**Do not use ordinary handwriting fonts (TTF/OTF/Google Fonts) for the animation.** They are outline fonts: animating their paths traces the outside edge of each letter and looks wrong. Use **single-stroke (centre-line) fonts** instead.

- Source: the npm package `hersheytext` ships single-stroke SVG fonts in `svg_fonts/`. Good choices are `EMSAllure.svg` (flowing script, OFL licence) and `HersheyScript1.svg` (classic cursive). Both include French accented characters.
- Glyph paths in these files use only `M` and `L` commands. Font units: 1000 per em, y-axis points up, baseline at 0.
- Write a one-off Node script (`scripts/convert-fonts.mjs`) that converts each SVG font into compact JSON: `{ [char]: [advanceWidth, [[x0,y0,x1,y1,...], ...strokes]] }`. Commit the JSON, not the script output pipeline.

**Layout (`lib/handwriting.ts`)** must be pure and deterministic:

- Wrap text by measuring advance widths; break words longer than a line.
- Preserve the sender's line breaks and blank lines.
- Flip y and position each glyph on its line, producing an ordered list of strokes in page coordinates, each with precomputed cumulative lengths.
- Add small seeded randomness per word (baseline wander, slight slant and size variation, ink opacity) so it doesn't look mechanical. Seed from the letter ID so the same letter always looks the same.
- Map curly quotes and other unsupported characters to supported ones (strip accents as a fallback); never crash on emoji.

**Animation (`HandwrittenLetter.tsx`)**:

- Render one SVG `<path>` per stroke with `stroke-dasharray`/`stroke-dashoffset` set to the stroke length, then reveal it in a `requestAnimationFrame` loop.
- Update paths imperatively via refs during the animation. Do not put per-frame state in React state.
- A fountain pen graphic (inline SVG) follows the point currently being drawn and lifts slightly between strokes.
- Timing: steady speed while the nib is down, short lifts within a word, longer pauses between words, longer still after commas, full stops and line ends.
- Cap total duration (about 60–90 seconds) by speeding up long letters.
- Auto-scroll so the line being written stays in view.
- Provide a "Show the whole letter" button that finishes instantly.
- Measure the container width once at start; don't reflow mid-animation.
- Respect `prefers-reduced-motion`: show the finished letter immediately.

**Sound (optional)**: generate a soft scratch from filtered noise with the Web Audio API. Only create the `AudioContext` after the user's click on the envelope (browser autoplay rules), and include a mute toggle.

## Pages and behaviour

**Compose page (`/`)**
- Fields: recipient name (optional), message (required, max 2000 chars, character counter), sender name (optional), handwriting style choice with a small preview of each.
- On submit: POST to `/api/letters`, then show the link with Copy, Share on WhatsApp (`https://wa.me/?text=...`) and Preview buttons.
- Show clear, specific error messages.

**Letter page (`/l/[id]`)**
- Server component fetches the letter; unknown or malformed ID → `notFound()`.
- `generateMetadata`: link previews say "A letter from {sender}" (or "A letter for you") and must **never** include the message text. Set `robots: noindex`.
- Starts on an envelope with a wax seal; clicking the seal opens it and starts the writing.
- The written letter includes: date (right-aligned), "Dear {recipient}," if given, the message, and the sender's name right-aligned if given.
- After writing finishes, show a "Write a letter back" link to `/`.

## Next.js notes

- This uses a recent Next.js: dynamic route `params` is a **Promise**, so `const { id } = await params`.
- Use `export const dynamic = "force-dynamic"` on the letter page.
- Keep `"use client"` only on components that need it.

## Design direction

- Feel: a writing desk. Paper sheet with faint ruled lines on a darker desk background, blue-black ink, a red wax seal.
- One elegant serif for the interface; the handwriting itself is the star, so keep the UI quiet.
- Mobile first: most recipients will open links from WhatsApp on a phone. Test at 360–400px wide.
- Visible keyboard focus, sufficient contrast, buttons named by what they do ("Copy link", not "Submit").

## Working rules for Claude

- Before large changes, briefly state the plan and which files you'll touch.
- Run `npm run build` after changes and fix all type errors.
- Don't add dependencies without saying why; prefer small, well-known packages and pin versions.
- Don't add features I didn't ask for (accounts, analytics, read receipts, payments). Suggest them instead.
- Keep functions small and commented where the logic isn't obvious (especially layout and timing).
- Never commit `.env*` files or secrets.

## Possible later features (only when asked)

- Letter expiry or "self-destruct after reading"
- Read receipt for the sender
- More handwriting styles and ink colours
- Downloading the finished letter as an image or PDF
- Basic rate limiting on `POST /api/letters` (e.g. Upstash or Vercel KV)
