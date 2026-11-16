import { assert, assertEquals } from "@std/assert";
import { renderMml } from "@kuboon/bgm";

import { song } from "../../client/sudoku/song.ts";
import { musicLevel } from "../../client/_shared/music.ts";

const RATE = 8000;

Deno.test("every piece of the song renders", () => {
  for (const piece of [song.calm, ...song.hype, song.fanfare]) {
    const { samples } = renderMml(piece.mml, piece.instruments, RATE);
    assert(samples.length > RATE, "at least a second of audio");
  }
});

Deno.test("the hype stems loop in lockstep", () => {
  const lengths = song.hype.map((p) => {
    const { samples, loopStart } = renderMml(p.mml, p.instruments, RATE);
    assertEquals(loopStart, 0);
    return samples.length;
  });
  // 8 bars of 4/4 at t152.
  for (const length of lengths) {
    assertEquals(length, Math.round((8 * 4 * 60 / 152) * RATE));
  }
});

Deno.test("music stays calm until half the blanks are filled, then builds to the top", () => {
  const layers = song.hype.length;
  // Blanks a grid can have: 4×4 has ~10, 9×9 up to ~55.
  for (const total of [10, 22, 41, 55]) {
    const half = Math.ceil(total / 2);
    assertEquals(musicLevel(half - 1, total, layers), 0);
    assertEquals(musicLevel(half, total, layers) >= 1, true);
    assertEquals(musicLevel(total - 1, total, layers), layers);
    for (let good = half; good < total - 1; good++) {
      assert(
        // More blanks than layers: a layer every few digits, never one going away.
        musicLevel(good + 1, total, layers) >= musicLevel(good, total, layers),
      );
    }
  }
});
