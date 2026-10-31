"use client";

import { useEffect, useRef, useState } from "react";
import {
  layoutLetter,
  loadFont,
  planTimeline,
  pointAt,
  type LetterContent,
  type LetterLayout,
} from "@/lib/handwriting";
import type { Style } from "@/lib/constants";
import type { PenSound } from "@/lib/penSound";

type Props = {
  content: LetterContent;
  style: Style;
  /** True to show the finished letter at once (already read in this browser). */
  skip: boolean;
  sound: PenSound | null;
  onDone: () => void;
};

// Where the pen's nib tip sits inside its own SVG (see PenGraphic).
const PEN_TIP_X = 20;
const PEN_TIP_Y = 136;
const PEN_ANGLE = 28; // degrees, leaning to the right like a right-handed writer

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (f: number) => f * f * (3 - 2 * f);

export default function HandwrittenLetter({ content, style, skip, sound, onDone }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const finishRef = useRef<() => void>(() => {});
  const [layout, setLayout] = useState<LetterLayout | null>(null);
  const [failed, setFailed] = useState(false);

  // Keep the latest callbacks without restarting the animation.
  const soundRef = useRef(sound);
  const onDoneRef = useRef(onDone);
  const skipRef = useRef(skip);
  useEffect(() => {
    soundRef.current = sound;
    onDoneRef.current = onDone;
    skipRef.current = skip;
  });

  // Load the font and lay out once, at the width measured now.
  // We deliberately don't reflow on resize mid-animation.
  useEffect(() => {
    let cancelled = false;
    loadFont(style)
      .then((font) => {
        if (cancelled || !wrapRef.current) return;
        setLayout(layoutLetter(content, font, wrapRef.current.clientWidth));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [content, style]);

  // Run the writing animation. All per-frame updates go straight to the DOM.
  useEffect(() => {
    if (!layout) return;
    const strokes = layout.strokes;
    const paths = pathRefs.current;
    const pen = penRef.current;
    const n = strokes.length;
    let raf = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      for (let i = 0; i < n; i++) {
        const p = paths[i];
        if (p) {
          p.style.strokeDasharray = "none";
          p.style.strokeDashoffset = "0";
        }
      }
      soundRef.current?.setNib(false);
      if (pen) pen.style.opacity = "0";
      onDoneRef.current();
    };
    finishRef.current = finish;

    // Skip may have been asked for before the font finished loading.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || skipRef.current || n === 0) {
      finish();
      return;
    }

    const timeline = planTimeline(layout);
    const { starts, durations } = timeline;
    const wrap = wrapRef.current!;
    const sheetTop = wrap.getBoundingClientRect().top + window.scrollY;

    // Pause auto-scroll for a few seconds whenever the reader scrolls themselves.
    let userScrollUntil = 0;
    const onUserScroll = () => {
      userScrollUntil = performance.now() + 4000;
    };
    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchmove", onUserScroll, { passive: true });
    window.addEventListener("keydown", onUserScroll);

    /** Ease the window down so the line being written stays in view. */
    const followPen = (y: number, now: number) => {
      if (now < userScrollUntil) return;
      const target = sheetTop + y - window.innerHeight * 0.55;
      const diff = target - window.scrollY;
      if (diff > 4) window.scrollTo(0, window.scrollY + Math.max(1, diff * 0.08));
    };

    const placePen = (x: number, y: number, lift: number) => {
      if (!pen) return;
      pen.style.opacity = "1";
      pen.style.transform =
        `translate(${x - PEN_TIP_X}px, ${y - PEN_TIP_Y - lift}px) rotate(${PEN_ANGLE}deg)`;
    };

    // The pen enters from just right of the first stroke.
    const first = strokes[0];
    const enter: [number, number] = [first.pts[0] + layout.fontSize * 2, first.pts[1] - layout.fontSize];

    let i = 0; // the stroke currently being drawn (or waited for)
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = now - t0;

      // Complete every stroke whose time has passed.
      while (i < n && t >= starts[i] + durations[i]) {
        const p = paths[i];
        if (p) p.style.strokeDashoffset = "0";
        i++;
      }
      if (i >= n) {
        finish();
        return;
      }

      const s = strokes[i];
      let x: number;
      let y: number;
      let lift: number;

      if (t >= starts[i]) {
        // Nib down: reveal the stroke up to the current distance.
        const drawn = s.length * clamp01((t - starts[i]) / durations[i]);
        const p = paths[i];
        if (p) p.style.strokeDashoffset = String(s.length + 1 - drawn);
        [x, y] = pointAt(s, drawn);
        lift = 0;
        soundRef.current?.setNib(true);
      } else {
        // Nib up: glide from the end of the last stroke to the start of this one,
        // rising higher for longer pauses.
        const prev = i > 0 ? strokes[i - 1] : null;
        const from: [number, number] = prev
          ? [prev.pts[prev.pts.length - 2], prev.pts[prev.pts.length - 1]]
          : enter;
        const gapStart = i > 0 ? starts[i - 1] + durations[i - 1] : 0;
        const gapLen = starts[i] - gapStart;
        const f = clamp01((t - gapStart) / (gapLen || 1));
        const e = smooth(f);
        x = from[0] + (s.pts[0] - from[0]) * e;
        y = from[1] + (s.pts[1] - from[1]) * e;
        lift = Math.sin(Math.PI * f) * Math.min(layout.fontSize * 0.45, 2 + gapLen * 0.025);
        soundRef.current?.setNib(false);
      }

      placePen(x, y, lift);
      followPen(y, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      soundRef.current?.setNib(false);
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchmove", onUserScroll);
      window.removeEventListener("keydown", onUserScroll);
    };
  }, [layout]);

  useEffect(() => {
    if (skip) finishRef.current();
  }, [skip]);

  // Font failed to load (e.g. offline): still show the words.
  useEffect(() => {
    if (failed) onDoneRef.current();
  }, [failed]);

  const plainText = [
    content.date,
    content.recipient ? `Dear ${content.recipient},` : "",
    content.body,
    [content.closing, content.sender].filter(Boolean).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="sheet">
      <p className="visually-hidden">{plainText}</p>
      <div ref={wrapRef} className="sheet-inner" aria-hidden="true">
        {failed ? (
          <p className="sheet-fallback">{plainText}</p>
        ) : layout ? (
          <svg
            className="letter-svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            <g className="rules">
              {layout.rules.map((y, i) => (
                <line key={i} x1={0} x2={layout.width} y1={y + 1.5} y2={y + 1.5} />
              ))}
            </g>
            <g className="ink" strokeWidth={layout.strokeWidth}>
              {layout.strokes.map((s, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    pathRefs.current[i] = el;
                  }}
                  d={s.d}
                  opacity={s.opacity}
                  style={{ strokeDasharray: `${s.length + 1} ${s.length + 1}`, strokeDashoffset: s.length + 1 }}
                />
              ))}
            </g>
          </svg>
        ) : (
          <div className="sheet-placeholder" />
        )}
        <div ref={penRef} className="pen">
          <PenGraphic />
        </div>
      </div>
    </div>
  );
}

/** Fountain pen, drawn upright with the nib tip at (PEN_TIP_X, PEN_TIP_Y). */
function PenGraphic() {
  return (
    <svg width="40" height="140" viewBox="0 0 40 140" focusable="false">
      <defs>
        <linearGradient id="pen-barrel" x1="0" x2="1">
          {/* Barrel colour follows the letter's theme (see globals.css). */}
          <stop offset="0" style={{ stopColor: "var(--pen-1)" }} />
          <stop offset="0.35" style={{ stopColor: "var(--pen-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--pen-3)" }} />
        </linearGradient>
        <linearGradient id="pen-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#a8822e" />
          <stop offset="0.45" stopColor="#f1d68a" />
          <stop offset="1" stopColor="#9c7424" />
        </linearGradient>
      </defs>
      {/* barrel */}
      <rect x="12" y="2" width="16" height="96" rx="7" fill="url(#pen-barrel)" />
      {/* clip */}
      <rect x="25" y="8" width="3" height="40" rx="1.5" fill="url(#pen-gold)" />
      {/* rings */}
      <rect x="11.5" y="92" width="17" height="5" rx="1" fill="url(#pen-gold)" />
      {/* grip section */}
      <path d="M13 97 H27 L25.5 112 H14.5 Z" fill="#15161f" />
      {/* nib */}
      <path d="M14.5 112 H25.5 Q26 122 20 136 Q14 122 14.5 112 Z" fill="url(#pen-gold)" />
      <circle cx="20" cy="121" r="1.2" fill="#15161f" />
      <path d="M20 122.5 V134" stroke="#15161f" strokeWidth="0.7" />
    </svg>
  );
}
