// All sound for the letter page: background music plus the pen scratch,
// sharing one AudioContext and one mute switch.
//
// Create it only inside a click handler: browsers refuse to start audio
// before the user has interacted with the page.

import { startMusic } from "./music";
import { createPenSound, type PenSound } from "./penSound";
import type { Theme } from "./constants";

export type LetterAudio = {
  pen: PenSound;
  setMuted(muted: boolean): void;
  dispose(): void;
};

export function createLetterAudio(muted: boolean, theme: Theme): LetterAudio | null {
  const Ctx =
    typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctx) return null;

  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  const music = startMusic(ctx, master, theme);
  const pen = createPenSound(ctx, master);

  // Go quiet while the tab is hidden (e.g. switching back to WhatsApp).
  const onVisibility = () => {
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    pen,
    setMuted(m) {
      if (ctx.state === "suspended" && !document.hidden) void ctx.resume();
      master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.15);
    },
    dispose() {
      document.removeEventListener("visibilitychange", onVisibility);
      music.dispose();
      pen.dispose();
      void ctx.close();
    },
  };
}
