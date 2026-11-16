/**
 * ドパ数独's BGM, in MML for `@kuboon/bgm`. See `client/_shared/music.ts` for how it plays.
 *
 * - **calm** (t88): music box over a rolling arpeggio, Am – F – C – G. Thinking music.
 * - **hype** (t152): Am – F – G – C – Dm – Em – F – G, a driving minor-to-major run. Six stems,
 *   each one more layer of harmony than the last:
 *   0. pumping octave bass, four-on-the-floor kick, off-beat hats
 *   1. sawtooth pad — the triads
 *   2. the lead melody
 *   3. music-box sixteenth arpeggios
 *   4. power-chord guitar and a snare backbeat
 *   5. high strings on the upper voices, and sixteenth hats
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
  mml: `t88
    L @0 o5 v10 l8
      a4. b >c2<  b4 a4 f2  e4. g >c4< b4  a2. r4
      a4 >c4 e4 d4  c2< a4 b4  >c4< b4 a4 g4  a2 r2 ;
    L @1 v6 l8 [
      o3 a o4 c e a o5 c o4 a e c
      o3 f a o4 c f a f c o3 a
      o4 c e g o5 c e c o4 g e
      o3 g b o4 d g b g d o3 b ]2 ;
    L @2 v10 [ o2 a2 o3 e2 o2 f2 o3 c2 o3 c2 g2 o2 g2 o3 d2 ]2`,
  instruments: [musicBox, triangle, triangle],
};

const T = "t152";

const hype = [
  // 0: bass, kick, off-beat hats
  {
    mml: `${T}
      L @0 v12 o2 l8 [a>a<]4 [f>f<]4 [g>g<]4 [c>c<]4 [d>d<]4 [e>e<]4 [f>f<]4 [g>g<]4 ;
      L @1 v13 [c4]32 ;
      L @2 v7 [r8 c8]32`,
    instruments: [triangle, kick, hihat],
  },
  // 1: the triads
  {
    mml: `${T}
      L @0 v5 q8 o4 c1 c1 d1 e1 d1 e1 f1 d1 ;
      L @0 v5 q8 o3 a1 a1 b1 g1 a1 g1 a1 b1 ;
      L @0 v5 q8 o3 e1 f1 g1 e1 f1 e1 f1 g1`,
    instruments: [sawtooth],
  },
  // 2: the lead
  {
    mml: `${T}
      L @0 v9 o5 l8
        e4 a4 >c4< b a  a4 g f e2  d4 g4 b4 a g  e2. r4
        f4 a4 >d4 c< a  g4 e4 b4 a g  a4 >c4 d c< a4  b2 >d4< b4`,
    instruments: [pulse(0.25)],
  },
  // 3: arpeggios
  {
    mml: `${T}
      L @0 v8 o5 l16
        [c e a >c< a e c e]2  [c f a >c< a f c f]2
        [d g b >d< b g d g]2  [c e g >c< g e c e]2
        [d f a >d< a f d f]2  [e g b >e< b g e g]2
        [c f a >c< a f c f]2  [d g b >d< b g d g]2`,
    instruments: [musicBox],
  },
  // 4: power chords and the backbeat
  {
    mml: `${T}
      L @0 v7 q5 o3 l8 [a]8 [f]8 [g]8 [c]8 [d]8 [e]8 [f]8 [g]8 ;
      L @0 v7 q5 o4 l8 [e]8 [c]8 [d]8 [g]8 [a]8 [b]8 [c]8 [d]8 ;
      L @1 v11 [r4 c4]16`,
    instruments: [electricGuitar, snare],
  },
  // 5: strings up high, sixteenth hats
  {
    mml: `${T}
      L @0 v5 q8 o5 e2 a2 f2 a2 d2 g2 e2 g2 f2 a2 e2 b2 f2 a2 d2 b2 ;
      L @0 v4 q8 o6 c1 c1 d1 e1 d1 e1 f1 d1 ;
      L @1 v5 l16 [c]128`,
    instruments: [sawtooth, hihat],
  },
];

const fanfare = {
  mml: `t150
    @0 v12 o5 l16 e f g a >c4. <g8 >e2 ;
    @1 v8 o4 l16 c d e f g4. e8 g2 ;
    @1 v8 o4 l16 g a b >c e4. c8 c2 ;
    @2 v13 l16 c c c c c4. c8 c2`,
  instruments: [pulse(0.25), sawtooth, kick],
};

export const song: Song = { calm, hype, fanfare };
