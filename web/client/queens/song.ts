/**
 * ドパクイーン's BGM, in MML for `@kuboon/bgm`. See `client/_shared/music.ts` for how it plays.
 *
 * - **calm** (t84): music box over a soft arpeggio, Cmaj7 – Am7 – Fmaj7 – G7. Unhurried.
 * - **hype** (t144): the 王道進行 F – G – Em – Am, F – G – C – C. Six stems, each one more layer
 *   of harmony than the last:
 *   0. bass and four-on-the-floor kick with off-beat hats
 *   1. sawtooth pad — the triads
 *   2. the lead melody
 *   3. music-box arpeggios on the 7ths and 9ths
 *   4. power-chord guitar and a snare backbeat
 *   5. high strings on the tensions, and sixteenth hats
 *
 * Every hype stem is 8 bars and starts with `L` at 0, so they loop in lockstep.
 */

import {
  electricGuitar,
  hihat,
  kick,
  musicBox,
  pulse,
  sawtooth,
  snare,
  triangle,
} from "@kuboon/bgm/instruments";

import type { Song } from "../_shared/music.ts";

const calm = {
  mml: `t84
    L @0 o5 v10 l8
      e4.g b2  a4 g4 e2  f4.a >c4<a4  g2. r4
      e4 g4 >c4<b4  a2 e4 g4  f4 e4 d4 c4  d2 r2 ;
    L @1 v6 l8 [
      o4 c e g b o5 c o4 b g e
      o3 a o4 c e g a g e c
      o3 f a o4 c e f e c o3 a
      o3 g b o4 d f g f d o3 b ]2 ;
    L @2 v10 [ o2 c2 g2 o2 a2 o3 e2 o2 f2 o3 c2 o2 g2 o3 d2 ]2`,
  instruments: [musicBox, triangle, triangle],
};

const T = "t144";

const hype = [
  // 0: bass, kick, off-beat hats
  {
    mml: `${T}
      L @0 v12 o2 l8 [f>f<]4 [g>g<]4 [e>e<]4 [a>a<]4 [f>f<]4 [g>g<]4 [c>c<]4 [c>c<]4 ;
      L @1 v13 [c4]32 ;
      L @2 v7 [r8 c8]32`,
    instruments: [triangle, kick, hihat],
  },
  // 1: the triads
  {
    mml: `${T}
      L @0 v5 q8 o4 c1 d1 e1 e1 c1 d1 e1 e1 ;
      L @0 v5 q8 o3 a1 b1 b1 o4 c1 o3 a1 b1 o4 c1 c1 ;
      L @0 v5 q8 o3 f1 g1 g1 a1 f1 g1 g1 g1`,
    instruments: [sawtooth],
  },
  // 2: the lead
  {
    mml: `${T}
      L @0 v9 o5 l8
        a4 g a >c4< a4  b4 a b >d4< b4  >e4.d c4< b4  a2. r4
        a b >c d e4 c4<  >d4 c <b >c4 d4<  >e2.< g4  >c1<`,
    instruments: [pulse(0.25)],
  },
  // 3: arpeggios on the extensions
  {
    mml: `${T}
      L @0 v8 o5 l16
        [f a >c e g e c< a]2  [g b >d f a f d< b]2
        [e g b >d e d< b g]2  [a >c e g b g e c<]2
        [f a >c e g e c< a]2  [g b >d f a f d< b]2
        [c e g b >d< b g e]4`,
    instruments: [musicBox],
  },
  // 4: power chords and the backbeat
  {
    mml: `${T}
      L @0 v7 q5 o3 l8 [f]8 [g]8 [e]8 [a]8 [f]8 [g]8 [c]8 [c]8 ;
      L @0 v7 q5 l8 o4 [c]8 [d]8 o3 [b]8 o4 [e]8 [c]8 [d]8 o3 [g]8 [g]8 ;
      L @1 v11 [r4 c4]16`,
    instruments: [electricGuitar, snare],
  },
  // 5: strings on the tensions, sixteenth hats
  {
    mml: `${T}
      L @0 v5 q8 o5 e2 g2 f2 a2 d2 b2 g2 b2 e2 g2 f2 a2 d2 e2 g2 b2 ;
      L @0 v4 q8 o6 c1 d1 o5 b1 o6 c1 c1 d1 e1 g1 ;
      L @1 v5 l16 [c]128`,
    instruments: [sawtooth, hihat],
  },
];

const fanfare = {
  mml: `t150
    @0 v12 o5 l16 c d e g >c4. <g8 >c2 ;
    @1 v8 o4 l16 e f g b >e4. <b8 >e2 ;
    @1 v8 o4 l16 g a b >d g4. d8 g2 ;
    @2 v13 l16 c c c c c4. c8 c2`,
  instruments: [pulse(0.25), sawtooth, kick],
};

export const song: Song = { calm, hype, fanfare };
