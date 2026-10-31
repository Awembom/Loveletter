"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Hearts from "./Hearts";
import {
  MAX_BODY,
  MAX_NAME,
  STYLES,
  STYLE_LABELS,
  THEMES,
  THEME_TEXT,
  charCount,
  type Style,
  type Theme,
} from "@/lib/constants";
import { layoutLetter, loadFont, type LetterLayout } from "@/lib/handwriting";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string };

const INTRO: Record<Theme | "choose", string> = {
  choose: "Write your message and get a link. When they open it, they'll watch it being written by hand.",
  love: "Pour your heart out and get a link. When they open it, they'll watch every word being written by hand.",
  friend: "Write your message and get a link. When they open it, they'll watch it being written by hand.",
};

export default function Composer() {
  // No default: the sender picks the kind of letter first, so a love
  // letter never goes to a friend by accident.
  const [theme, setTheme] = useState<Theme | null>(null);
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const [style, setStyle] = useState<Style>("allure");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [letterId, setLetterId] = useState<string | null>(null);

  const startOver = () => {
    setTheme(null);
    setRecipient("");
    setBody("");
    setSender("");
    setLetterId(null);
  };

  return (
    <main className={`desk theme-${theme ?? "love"}`}>
      {theme === "love" && <Hearts />}
      <header className="intro">
        {theme === "love" && <p className="intro-mark" aria-hidden="true">♥</p>}
        <h1>{theme ? THEME_TEXT[theme].heading : "Write a letter"}</h1>
        <p>{INTRO[theme ?? "choose"]}</p>
      </header>

      {!theme ? (
        <TypeChooser onChoose={setTheme} />
      ) : letterId ? (
        <SharePanel id={letterId} theme={theme} recipient={recipient.trim()} onNew={startOver} />
      ) : (
        <LetterForm
          theme={theme}
          onChangeTheme={() => setTheme(null)}
          fields={{ recipient, body, sender, style }}
          setters={{ setRecipient, setBody, setSender, setStyle }}
          status={status}
          onSubmit={async () => {
            const id = await sendLetter({ recipient, sender, body, style, theme }, setStatus);
            if (id) setLetterId(id);
          }}
        />
      )}
    </main>
  );
}

/** POST the letter. Returns its ID, or null after setting an error. */
async function sendLetter(
  letter: { recipient: string; sender: string; body: string; style: Style; theme: Theme },
  setStatus: (s: Status) => void,
): Promise<string | null> {
  const count = charCount(letter.body);
  if (!letter.body.trim()) {
    setStatus({ kind: "error", message: "Please write a message before sending." });
    return null;
  }
  if (count > MAX_BODY) {
    setStatus({ kind: "error", message: `Your message is ${count - MAX_BODY} characters over the limit.` });
    return null;
  }
  setStatus({ kind: "sending" });
  try {
    const res = await fetch("/api/letters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(letter),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      setStatus({ kind: "error", message: data.error ?? "Your letter couldn't be saved. Please try again." });
      return null;
    }
    setStatus({ kind: "idle" });
    return data.id;
  } catch {
    setStatus({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    return null;
  }
}

/** First step: who is this letter for? Each card shows its own theme. */
function TypeChooser({ onChoose }: { onChoose: (t: Theme) => void }) {
  return (
    <section className="card chooser" aria-labelledby="chooser-title">
      <h2 id="chooser-title">Who is this letter for?</h2>
      <div className="type-options">
        {THEMES.map((t) => (
          <button key={t} type="button" className={`type-option theme-${t}`} onClick={() => onChoose(t)}>
            <span className="mini-envelope" aria-hidden="true">
              <span className="mini-seal">{t === "love" ? "♥" : ""}</span>
            </span>
            <span className="type-label">{THEME_TEXT[t].label}</span>
            <span className="type-hint">{THEME_TEXT[t].hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type FormProps = {
  theme: Theme;
  onChangeTheme: () => void;
  fields: { recipient: string; body: string; sender: string; style: Style };
  setters: {
    setRecipient: (v: string) => void;
    setBody: (v: string) => void;
    setSender: (v: string) => void;
    setStyle: (v: Style) => void;
  };
  status: Status;
  onSubmit: () => void;
};

function LetterForm({ theme, onChangeTheme, fields, setters, status, onSubmit }: FormProps) {
  const { recipient, body, sender, style } = fields;
  const text = THEME_TEXT[theme];
  const count = charCount(body);
  const tooLong = count > MAX_BODY;
  const firstField = useRef<HTMLInputElement>(null);

  // The chooser button that had focus is gone; move focus into the form.
  useEffect(() => firstField.current?.focus({ preventScroll: true }), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="card composer" onSubmit={submit} noValidate>
      <p className="type-current">
        <span>You're writing <strong>{text.label.toLowerCase()}</strong></span>
        <button type="button" className="link-button" onClick={onChangeTheme}>
          Change letter type
        </button>
      </p>

      <div className="field">
        <label htmlFor="recipient">To <span className="optional">(optional)</span></label>
        <input
          ref={firstField}
          id="recipient"
          type="text"
          value={recipient}
          maxLength={MAX_NAME}
          autoComplete="off"
          placeholder={text.recipientPlaceholder}
          onChange={(e) => setters.setRecipient(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="body">Your message</label>
        <textarea
          id="body"
          value={body}
          rows={9}
          required
          aria-describedby="body-count"
          aria-invalid={tooLong || undefined}
          placeholder={theme === "love" ? "Write something from the heart…" : "Write what's on your mind…"}
          onChange={(e) => setters.setBody(e.target.value)}
        />
        <p id="body-count" className={`counter${tooLong ? " is-over" : ""}`}>
          {count} / {MAX_BODY}
        </p>
      </div>

      <div className="field">
        <label htmlFor="sender">From <span className="optional">(optional)</span></label>
        <input
          id="sender"
          type="text"
          value={sender}
          maxLength={MAX_NAME}
          autoComplete="given-name"
          placeholder="Your name"
          onChange={(e) => setters.setSender(e.target.value)}
        />
      </div>

      <fieldset className="field styles">
        <legend>Handwriting</legend>
        <div className="style-options">
          {STYLES.map((s) => (
            <label key={s} className={`style-option${style === s ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="style"
                value={s}
                checked={style === s}
                onChange={() => setters.setStyle(s)}
              />
              <StylePreview style={s} text={text.stylePreview} />
              <span className="style-name">{STYLE_LABELS[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status.kind === "error" && (
        <p className="error" role="alert">{status.message}</p>
      )}

      <button type="submit" className="button" disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "Sealing your letter…" : `Seal the ${text.kind} and get a link`}
      </button>
    </form>
  );
}

/** A small sample of a handwriting style, drawn statically. */
function StylePreview({ style, text }: { style: Style; text: string }) {
  const [layout, setLayout] = useState<LetterLayout | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFont(style).then((font) => {
      if (!cancelled) setLayout(layoutLetter({ seed: "preview", body: text }, font, 300));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [style, text]);

  if (!layout) return <span className="style-preview" aria-hidden="true" />;

  // Crop the view to the ink so the sample fills the tile.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of layout.strokes) {
    for (let i = 0; i < s.pts.length; i += 2) {
      minX = Math.min(minX, s.pts[i]);
      maxX = Math.max(maxX, s.pts[i]);
      minY = Math.min(minY, s.pts[i + 1]);
      maxY = Math.max(maxY, s.pts[i + 1]);
    }
  }
  const pad = layout.strokeWidth * 2;
  const viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

  return (
    <svg className="style-preview" viewBox={viewBox} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <g className="ink" strokeWidth={layout.strokeWidth}>
        {layout.strokes.map((s, i) => <path key={i} d={s.d} />)}
      </g>
    </svg>
  );
}

type ShareProps = { id: string; theme: Theme; recipient: string; onNew: () => void };

function SharePanel({ id, theme, recipient, onNew }: ShareProps) {
  const [url, setUrl] = useState(`/l/${id}`);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => setUrl(`${window.location.origin}/l/${id}`), [id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  const message = theme === "love"
    ? `${recipient ? `${recipient}, I` : "I"} wrote you a love letter ♥ Open it here: ${url}`
    : `${recipient ? `${recipient}, I` : "I"} wrote you a letter. Open it here: ${url}`;

  return (
    <section className="card share" aria-labelledby="share-title">
      {theme === "love" && <p className="share-mark" aria-hidden="true">♥</p>}
      <h2 id="share-title">{theme === "love" ? "Your letter is sealed with love" : "Your letter is sealed"}</h2>
      <p>Send this link{recipient ? ` to ${recipient}` : ""}. They'll see an envelope, and the letter writes itself when they open it.</p>

      <label htmlFor="share-link" className="visually-hidden">Link to your letter</label>
      <input id="share-link" className="share-link" type="text" value={url} readOnly onFocus={(e) => e.target.select()} />

      <div className="share-actions">
        <button type="button" className="button" onClick={copy}>
          {copied === "done" ? "Link copied" : "Copy link"}
        </button>
        <a className="button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          Share on WhatsApp
        </a>
        <a className="button button-quiet" href={`/l/${id}`} target="_blank" rel="noopener">
          Preview the letter
        </a>
      </div>
      <p className="status" role="status">
        {copied === "done" ? "The link is on your clipboard." : copied === "failed" ? "Couldn't copy automatically. Select the link above and copy it." : ""}
      </p>

      <button type="button" className="link-button" onClick={onNew}>Write another letter</button>
    </section>
  );
}
