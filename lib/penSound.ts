// Soft pen-on-paper scratch made from filtered noise (Web Audio API).
// Created by lib/letterAudio.ts, which owns the AudioContext and mute.

export type PenSound = {
  /** Nib touches (true) or leaves (false) the paper. */
  setNib(down: boolean): void;
  dispose(): void;
};

// Pen scratch loudness. Kept well under the music so it's a hint of
// paper texture, not a hiss. (Was 0.09, then 0.01.)
const VOLUME = 0.004;

export function createPenSound(ctx: AudioContext, destination: AudioNode): PenSound {
  // Two seconds of white noise, looped.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  // Band-pass around the papery "hiss", minus the rumble. Centred fairly
  // low so it sounds soft rather than sharp.
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1800;
  band.Q.value = 0.7;
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 900;

  // `nib` opens while drawing.
  const nib = ctx.createGain();
  nib.gain.value = 0;

  noise.connect(band).connect(high).connect(nib).connect(destination);
  noise.start();

  let down = false;

  return {
    setNib(next) {
      if (next === down) return;
      down = next;
      const now = ctx.currentTime;
      nib.gain.cancelScheduledValues(now);
      // Slightly varied pressure on each touch.
      nib.gain.setTargetAtTime(next ? VOLUME * (0.75 + Math.random() * 0.5) : 0, now, next ? 0.015 : 0.03);
    },
    dispose() {
      try {
        noise.stop();
      } catch {
        // already stopped
      }
      nib.disconnect();
    },
  };
}
