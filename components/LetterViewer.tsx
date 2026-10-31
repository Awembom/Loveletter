"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Hearts from "./Hearts";
import HandwrittenLetter from "./HandwrittenLetter";
import { createLetterAudio, type LetterAudio } from "@/lib/letterAudio";
import { pickLoveClosing } from "@/lib/closings";
import { THEME_TEXT, type Style, type Theme } from "@/lib/constants";

type Props = {
  letter: {
    id: string;
    recipient: string | null;
    sender: string | null;
    body: string;
    style: Style;
    theme: Theme;
    date: string;
  };
};

type Phase = "sealed" | "opening" | "writing" | "done";

// Matches the envelope opening animation in globals.css.
const OPEN_MS = 1300;

// Remembers, in this browser only, which letters were fully written, so
// coming back (or the phone reloading the tab) shows the finished letter.
const readKey = (id: string) => `letter-read:${id}`;

function hasRead(id: string): boolean {
  try {
    return localStorage.getItem(readKey(id)) === "1";
  } catch {
    return false;
  }
}

function markRead(id: string) {
  try {
    localStorage.setItem(readKey(id), "1");
  } catch {
    // Private mode or storage blocked: the letter just plays again next time.
  }
}

export default function LetterViewer({ letter }: Props) {
  const love = letter.theme === "love";
  const kind = THEME_TEXT[letter.theme].kind;
  const [phase, setPhase] = useState<Phase>("sealed");
  const [skip, setSkip] = useState(false);
  // Bumped to restart the writing from scratch ("watch it again").
  const [run, setRun] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audio, setAudio] = useState<LetterAudio | null>(null);
  const audioRef = useRef<LetterAudio | null>(null);

  // Already read in this browser: go straight to the finished letter.
  useEffect(() => {
    if (hasRead(letter.id)) {
      setSkip(true);
      setPhase("done");
    }
  }, [letter.id]);

  const content = useMemo(
    () => ({
      seed: letter.id,
      date: letter.date,
      recipient: letter.recipient,
      body: letter.body,
      closing: letter.theme === "love" ? pickLoveClosing(letter.id) : null,
      sender: letter.sender,
    }),
    [letter],
  );

  useEffect(() => () => audioRef.current?.dispose(), []);

  // Must run inside a click: that is what lets us start audio (browser
  // autoplay rules), so music and pen sound begin on, with a toggle.
  const startAudio = () => {
    if (audioRef.current) return;
    const a = createLetterAudio(muted, letter.theme);
    audioRef.current = a;
    setAudio(a);
  };

  const open = () => {
    if (phase !== "sealed") return;
    startAudio();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase("opening");
    window.setTimeout(() => setPhase("writing"), reduce ? 0 : OPEN_MS);
  };

  const writeAgain = () => {
    startAudio();
    setSkip(false);
    setRun((r) => r + 1);
    setPhase("writing");
    window.scrollTo({ top: 0 });
  };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const soundButton = audio && (
    <button type="button" className="button button-quiet" onClick={toggleSound} aria-pressed={!muted}>
      {muted ? "Turn sound on" : "Turn sound off"}
    </button>
  );

  if (phase === "sealed" || phase === "opening") {
    return (
      <div className={`envelope-stage${phase === "opening" ? " is-opening" : ""}`}>
        {love && <Hearts />}
        <p className="envelope-note">
          {letter.sender ? `A ${kind} from ${letter.sender}` : `A ${kind} for you`}
        </p>
        <div className="envelope">
          <div className="envelope-back" />
          <div className="envelope-paper" />
          <div className="envelope-front" />
          <div className="envelope-flap" />
          {/* Little hearts that burst out when the seal breaks. */}
          {love && (
            <div className="seal-burst" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i}>♥</span>)}
            </div>
          )}
          <button
            type="button"
            className="seal"
            onClick={open}
            disabled={phase !== "sealed"}
            aria-label="Break the seal and open the letter"
          >
            <SealMark initial={sealInitial(letter.sender)} love={love} />
          </button>
        </div>
        <p className="envelope-hint" aria-hidden="true">Tap the seal to open</p>
      </div>
    );
  }

  return (
    <div className="reading">
      {love && <Hearts />}
      <HandwrittenLetter
        key={run}
        content={content}
        style={letter.style}
        skip={skip}
        sound={audio?.pen ?? null}
        onDone={() => {
          setPhase("done");
          markRead(letter.id);
        }}
      />

      {phase === "writing" ? (
        <div className="reading-bar">
          <button type="button" className="button button-quiet" onClick={() => setSkip(true)}>
            Show the whole letter
          </button>
          {soundButton}
        </div>
      ) : (
        <div className="reading-end">
          <Link href="/" className="button">Write a {kind} back</Link>
          <div className="reading-bar">
            <button type="button" className="button button-quiet" onClick={writeAgain}>
              Watch it being written again
            </button>
            {soundButton}
          </div>
        </div>
      )}
    </div>
  );
}

/** First letter of the sender's name for the wax seal, if it is a letter. */
function sealInitial(sender: string | null): string | null {
  const first = [...(sender?.trim() ?? "")][0];
  return first && /\p{L}/u.test(first) ? first.toUpperCase() : null;
}

/**
 * The design pressed into the wax. Love letters: a heart, with the
 * sender's initial inside if known. Others: a ring around the initial,
 * or a small star.
 */
function SealMark({ initial, love }: { initial: string | null; love: boolean }) {
  const heart = "M24 41 C12 32 5 25 5 17 a9.5 9.5 0 0 1 19 -3 a9.5 9.5 0 0 1 19 3 C43 25 36 32 24 41 Z";
  const star = "M24 12 L27 21 L36 24 L27 27 L24 36 L21 27 L12 24 L21 21 Z";
  if (!love) {
    return (
      <svg className="seal-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {initial ? (
          <text x="24" y="31.5" textAnchor="middle" fontSize="22" fill="currentColor">{initial}</text>
        ) : (
          <path d={star} fill="currentColor" />
        )}
      </svg>
    );
  }
  return (
    <svg className="seal-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {initial ? (
        <>
          <path d={heart} fill="none" stroke="currentColor" strokeWidth="2" />
          <text x="24" y="29.5" textAnchor="middle" fontSize="16" fill="currentColor">{initial}</text>
        </>
      ) : (
        <path d={heart} fill="currentColor" />
      )}
    </svg>
  );
}
