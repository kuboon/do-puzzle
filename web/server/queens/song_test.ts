import { assert, assertEquals } from "@std/assert";
import { renderMml } from "@kuboon/bgm";

import { song } from "../../client/queens/song.ts";
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
  // 8 bars of 4/4 at t144.
  for (const length of lengths) {
    assertEquals(length, Math.round((8 * 4 * 60 / 144) * RATE));
  }
});

Deno.test("music stays calm until half the queens are down, then builds to the top", () => {
  const layers = song.hype.length;
  for (let size = 5; size <= 10; size++) {
    const half = Math.ceil(size / 2);
    assertEquals(musicLevel(half - 1, size, layers), 0);
    assertEquals(musicLevel(half, size, layers) >= 1, true);
    assertEquals(musicLevel(size - 1, size, layers), layers);
    for (let good = half; good < size - 1; good++) {
      assert(
        musicLevel(good + 1, size, layers) > musicLevel(good, size, layers),
      );
    }
  }
});
