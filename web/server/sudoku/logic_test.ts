import { assert, assertEquals } from "@std/assert";

import {
  blanks,
  candidates,
  cluesForStage,
  completedUnits,
  generate,
  isSolved,
  judge,
  MAX_LIVES,
  peers,
  progress,
  puzzleForStage,
  sizeForStage,
  solve,
} from "../../client/sudoku/logic.ts";

function validGrid(size: number, br: number, bc: number, g: number[]) {
  const ok = (cells: number[]) =>
    new Set(cells.map((i) => g[i])).size === size &&
    cells.every((i) => g[i] >= 1 && g[i] <= size);
  for (let k = 0; k < size; k++) {
    const row = Array.from({ length: size }, (_, c) => k * size + c);
    const col = Array.from({ length: size }, (_, r) => r * size + k);
    const r0 = Math.floor(k / (size / bc)) * br;
    const c0 = (k % (size / bc)) * bc;
    const box = Array.from(
      { length: size },
      (_, j) => (r0 + Math.floor(j / bc)) * size + c0 + (j % bc),
    );
    if (!ok(row) || !ok(col) || !ok(box)) return false;
  }
  return true;
}

Deno.test("stages generate valid puzzles with exactly one solution", () => {
  for (let stage = 1; stage <= 40; stage++) {
    const p = puzzleForStage(stage);
    assertEquals(p.size, sizeForStage(stage));
    assertEquals(p.givens.length, p.size * p.size);
    assert(validGrid(p.size, p.boxRows, p.boxCols, p.solution), `${stage}`);
    p.givens.forEach((v, i) => assert(v === 0 || v === p.solution[i]));
    const solutions = solve(p.size, p.boxRows, p.boxCols, p.givens, 2);
    assertEquals(solutions.length, 1, `stage ${stage} must have one solution`);
    assertEquals(solutions[0], p.solution);
    const clues = p.size * p.size - blanks(p);
    assert(clues >= cluesForStage(stage), `stage ${stage} clues`);
    assert(blanks(p) > 0);
  }
});

Deno.test("sizes grow 4 → 6 → 9, and 9×9 gets harder", () => {
  assertEquals([1, 2, 3, 4, 30].map(sizeForStage), [4, 6, 6, 9, 9]);
  assert(cluesForStage(20) < cluesForStage(4));
});

Deno.test("generation is deterministic", () => {
  assertEquals(generate(9, 30, 42), generate(9, 30, 42));
  assertEquals(puzzleForStage(9), puzzleForStage(9));
});

Deno.test("peers are the row, column and box, without the cell", () => {
  const p = puzzleForStage(5);
  const ps = peers(p, 0);
  assertEquals(ps.length, 20);
  assert(!ps.includes(0));
  assert(ps.includes(8) && ps.includes(72) && ps.includes(20));
});

Deno.test("progress counts filled blanks; a full grid is solved", () => {
  const p = puzzleForStage(4);
  assertEquals(progress(p, p.givens), 0);
  assertEquals(progress(p, p.solution), 1);
  assert(isSolved(p, p.solution));
  assert(!isSolved(p, p.givens));
});

Deno.test("completedUnits finds the row, column and box a digit finishes", () => {
  const p = puzzleForStage(1);
  const values = [...p.solution];
  assertEquals(
    completedUnits(p, values, 0).map((u) => u.kind),
    ["row", "col", "box"],
  );
  values[1] = 0;
  assertEquals(completedUnits(p, values, 0).map((u) => u.kind), ["col"]);
});

Deno.test("candidates go by what is on the grid", () => {
  const p = puzzleForStage(6);
  const blank = p.givens.indexOf(0);
  const mask = candidates(p, p.givens, blank);
  assert(mask & (1 << p.solution[blank]), "the answer is always a candidate");
  for (const q of peers(p, blank)) {
    if (p.givens[q]) assert(!(mask & (1 << p.givens[q])));
  }
});

Deno.test("a wrong digit costs a heart, and with none left ends the game", () => {
  const p = puzzleForStage(4);
  const cell = p.givens.indexOf(0);
  const right = p.solution[cell];
  const wrong = right % 9 + 1;
  assertEquals(judge(p, cell, right, 0), { kind: "ok" });
  assertEquals(judge(p, cell, wrong, MAX_LIVES), {
    kind: "miss",
    lives: MAX_LIVES - 1,
  });
  assertEquals(judge(p, cell, wrong, 0), { kind: "over" });
});
