// Soft background music generated with the Web Audio API: a music-box
// melody over gently broken piano chords, with a little reverb.
// No audio files, so nothing to download or license.

import type { Theme } from "./constants";

export type Music = {
  dispose(): void;
};

const VOLUME = 0.2;
// How far ahead notes are scheduled. Generous, because timers in
// background tabs may only fire once a second.
const LOOKAHEAD = 1.5;

// Melody phrases, one bar per chord: [midi note, length in beats].
// `null` is a bar of rest, so the tune breathes between phrases.
type Phrase = ([number, number][] | null)[];
const REST: Phrase = [null, null, null, null];

type Song = {
  bpm: number;
  /** One chord per bar, as MIDI note numbers (lowest first). */
  chords: number[][];
  /** Played in order, then repeated. */
  phrases: Phrase[];
  /** Order of chord tones for the broken chord, one per eighth note. */
  arpeggio: number[];
  /** Reverb level, 0 to 1. */
  wet: number;
};

const SONGS: Record<Theme, Song> = {
  // Slow and tender, in F major: Fmaj7, Dm7, Bbmaj7, C.
  love: {
    bpm: 72,
    chords: [
      [53, 57, 60, 64],
      [50, 53, 57, 60],
      [46, 50, 53, 57],
      [48, 55, 60, 64],
    ],
    phrases: [
      [
        [[81, 2], [79, 1], [77, 1]],
        [[81, 3], [84, 1]],
        [[82, 2], [81, 1], [79, 1]],
        [[79, 4]],
      ],
      [
        [[77, 2], [81, 1], [84, 1]],
        [[86, 3], [84, 1]],
        [[82, 1], [81, 1], [79, 1], [77, 1]],
        [[76, 2], [79, 2]],
      ],
      REST,
    ],
    arpeggio: [0, 1, 2, 3, 2, 1, 2, 3],
    wet: 0.45,
  },
  // Light and cheerful, in G major: G, Em, C, D.
  friend: {
    bpm: 92,
    chords: [
      [55, 59, 62, 67],
      [52, 55, 59, 64],
      [48, 52, 55, 60],
      [50, 54, 57, 62],
    ],
    phrases: [
      [
        [[71, 1], [74, 1], [79, 2]],
        [[76, 2], [74, 1], [71, 1]],
        [[72, 1], [76, 1], [79, 1], [76, 1]],
        [[74, 4]],
      ],
      [
        [[74, 1], [79, 1], [78, 1], [79, 1]],
        [[83, 2], [79, 2]],
        [[76, 1], [79, 1], [84, 2]],
        [[81, 2], [78, 2]],
      ],
      REST,
    ],
    arpeggio: [0, 2, 1, 3, 0, 2, 1, 3],
    wet: 0.3,
  },
};

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Start the theme's music, fading in, connected to `destination`. */
export function startMusic(ctx: AudioContext, destination: AudioNode, theme: Theme): Music {
  const song = SONGS[theme];
  const bar = (60 / song.bpm) * 4;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 4);

  // Dry signal plus a reverb send for a sense of room.
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.8);
  const wet = ctx.createGain();
  wet.gain.value = song.wet;
  out.connect(destination);
  out.connect(reverb).connect(wet).connect(destination);

  // Bar-by-bar scheduler: keep notes queued LOOKAHEAD seconds ahead.
  let barIndex = 0;
  let nextBarTime = ctx.currentTime + 0.3;
  const tick = () => {
    while (nextBarTime < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(ctx, out, song, barIndex, nextBarTime);
      barIndex++;
      nextBarTime += bar;
    }
  };
  tick();
  const timer = window.setInterval(tick, 250);

  return {
    dispose() {
      window.clearInterval(timer);
      out.disconnect();
    },
  };
}

/** Queue every note of one bar starting at time `t`. */
function scheduleBar(ctx: AudioContext, out: AudioNode, song: Song, bar: number, t: number) {
  const beat = 60 / song.bpm;
  const bars = song.chords.length;
  const chord = song.chords[bar % bars];
  const phrase = song.phrases[Math.floor(bar / bars) % song.phrases.length];
  const melody = phrase[bar % bars];

  // Low root on the downbeat.
  piano(ctx, out, t, chord[0] - 12, 0.22, 3.5);

  // Broken chord, an octave up, very soft.
  song.arpeggio.forEach((tone, i) => {
    piano(ctx, out, t + i * (beat / 2), chord[tone] + 12, i === 0 ? 0.1 : 0.07, 2.2);
  });

  if (melody) {
    let at = t;
    for (const [note, beats] of melody) {
      musicBox(ctx, out, at, note, 0.16);
      at += beats * beat;
    }
  }
}

/** Warm, rounded tone: filtered triangle with a slow decay. */
function piano(ctx: AudioContext, out: AudioNode, t: number, midi: number, vol: number, decay: number) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  const env = envelope(ctx, t, vol, 0.02, decay);
  osc.connect(filter).connect(env).connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.1);
}

/** Bell-like music-box note: a sine with a faint, slightly sharp overtone. */
function musicBox(ctx: AudioContext, out: AudioNode, t: number, midi: number, vol: number) {
  const decay = 2.4;
  const env = envelope(ctx, t, vol, 0.004, decay);
  env.connect(out);
  const partials: [number, number][] = [[1, 1], [3.01, 0.12], [5.4, 0.04]];
  for (const [ratio, level] of partials) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq(midi) * ratio;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
}

/** Gain node shaped as a quick attack and an exponential fade. */
function envelope(ctx: AudioContext, t: number, vol: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  return g;
}

/** Stereo reverb tail: decaying noise. */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
  }
  return buffer;
}
