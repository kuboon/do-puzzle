/**
 * Adaptive BGM for every game, on `@kuboon/bgm`.
 *
 * The house rule (see `CLAUDE.md`) applies to the music too: it builds as the stage nears clear.
 * A song is two pieces at different tempos plus a fanfare:
 *
 * - **calm** — one relaxed loop for the first half of a stage.
 * - **hype** — a faster loop split into stems of the same length. Stem 0 (bass and drums) plays
 *   from the moment the board is half solved, crossfaded in from calm; each stem after it is a
 *   richer layer of harmony, faded in one by one with {@link Music.setLevel} as the player gets
 *   closer. All stems start on the same sample, so they stay locked together.
 * - **fanfare** — played once on clear.
 *
 * `@kuboon/bgm` renders MML to buffers, which takes real time on the main thread, so the hype
 * stems are rendered one per macrotask after calm has started rather than all up front.
 */

import { GameAudio, type Instrument, type Track } from "@kuboon/bgm";

export interface Piece {
  mml: string;
  instruments: readonly Instrument[];
  gain?: number;
}

export interface Song {
  calm: Piece;
  /** `[0]` is the base, the rest are layers in the order they come in. Same length, all of them. */
  hype: readonly Piece[];
  fanfare: Piece;
}

export interface Music {
  /** `0` plays calm; `1 … layers` plays hype with that many stems (base included). */
  setLevel(level: number): void;
  /** The fanfare; the BGM dips under it. */
  fanfare(): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

/**
 * Where a board's progress puts the music.
 *
 * Calm until half the pieces are down, then the base plus one more layer per piece, scaled so the
 * last layer arrives with the last piece before the clear whatever the board size.
 *
 * @param good Pieces placed that break no rule
 * @param total Pieces a solution needs
 * @param layers Hype stems, base included
 * @returns `0` for calm, else `1 … layers`
 */
export function musicLevel(
  good: number,
  total: number,
  layers: number,
): number {
  const half = Math.ceil(total / 2);
  if (good < half) return 0;
  const steps = Math.max(1, total - half);
  return Math.min(
    layers,
    Math.max(1, Math.ceil(((good - half + 1) * layers) / steps)),
  );
}

export function createMusic(song: Song): Music {
  let audio: GameAudio;
  try {
    audio = new GameAudio();
  } catch {
    // No Web Audio here: a silent game is still a game.
    return { setLevel() {}, fanfare() {}, setMuted() {}, destroy() {} };
  }
  audio.setVolume("bgm", 0.55);
  const ctx = audio.context;
  const compose = (p: Piece) =>
    audio.compose(p.mml, p.instruments, { gain: p.gain });

  let calm: Track | null = null;
  const stems: (Track | null)[] = song.hype.map(() => null);
  let fanfareTrack: Track | null = null;
  let level = 0;
  let destroyed = false;
  /** The hype stems while they play: one source and one gain each. */
  let playing: { source: AudioBufferSourceNode; gain: GainNode }[] | null =
    null;

  const stem = (i: number): Track => (stems[i] ??= compose(song.hype[i]));

  // Calm first, then the rest in the background so the first stage-half never stalls on it.
  calm = compose(song.calm);
  audio.playBgm(calm, { fade: 1.5 });
  let next = 0;
  const warm = () => {
    if (destroyed) return;
    if (next < stems.length) {
      stem(next++);
      setTimeout(warm, 30);
    } else fanfareTrack ??= compose(song.fanfare);
  };
  setTimeout(warm, 200);

  function startHype() {
    const at = ctx.currentTime + 0.05;
    playing = song.hype.map((_, i) => {
      const track = stem(i);
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.loop = true;
      source.loopStart = track.loopStart;
      source.loopEnd = track.loopEnd;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(audio.bus("bgm"));
      source.start(at);
      return { source, gain };
    });
  }

  function stopHype(fade: number) {
    const now = ctx.currentTime;
    for (const { source, gain } of playing ?? []) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fade);
      source.stop(now + fade + 0.05);
      source.addEventListener("ended", () => gain.disconnect());
    }
    playing = null;
  }

  function mix(fade: number) {
    const now = ctx.currentTime;
    playing?.forEach(({ gain }, i) => {
      const target = i < level ? 1 : 0;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(target, now + fade);
    });
  }

  return {
    setLevel(nextLevel) {
      if (destroyed) return;
      nextLevel = Math.max(
        0,
        Math.min(song.hype.length, Math.round(nextLevel)),
      );
      if (nextLevel === level) return;
      const was = level;
      level = nextLevel;
      if (level === 0) {
        stopHype(1.2);
        audio.playBgm(calm!, { fade: 1.5, restart: true });
        return;
      }
      if (was === 0 || playing === null) {
        audio.stopBgm({ fade: 0.8 });
        startHype();
        mix(0.8);
        return;
      }
      mix(level > was ? 0.4 : 1);
    },
    fanfare() {
      if (destroyed) return;
      audio.setVolume("bgm", 0.15, { fade: 0.2 });
      audio.playSe(fanfareTrack ??= compose(song.fanfare), { volume: 0.9 });
      setTimeout(() => {
        if (!destroyed) audio.setVolume("bgm", 0.55, { fade: 2 });
      }, 2500);
    },
    setMuted(muted) {
      if (!destroyed) audio.setVolume("master", muted ? 0 : 1, { fade: 0.3 });
    },
    destroy() {
      destroyed = true;
      stopHype(0.2);
      void audio.close();
    },
  };
}
