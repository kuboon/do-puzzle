import { assert, assertEquals } from "@std/assert";

import {
  attacked,
  conflicts,
  generate,
  isSolved,
  type Mark,
  progress,
  puzzleForStage,
  sizeForStage,
  solve,
} from "../../client/queens/logic.ts";

function queensAt(size: number, cols: readonly number[]): Mark[] {
  const marks = new Array<Mark>(size * size).fill("empty");
  cols.forEach((c, r) => (marks[r * size + c] = "queen"));
  return marks;
}

function regionsConnected(size: number, regions: readonly number[]): boolean {
  for (let region = 0; region < size; region++) {
    const cells = regions.flatMap((r, i) => (r === region ? [i] : []));
    if (cells.length === 0) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const cell = stack.pop()!;
      const r = Math.floor(cell / size), c = cell % size;
      const next = [
        r > 0 ? cell - size : -1,
        r < size - 1 ? cell + size : -1,
        c > 0 ? cell - 1 : -1,
        c < size - 1 ? cell + 1 : -1,
      ];
      for (const n of next) {
        if (n >= 0 && regions[n] === region && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

Deno.test("stages generate unique, valid, connected puzzles", () => {
  for (let stage = 1; stage <= 30; stage++) {
    const p = puzzleForStage(stage);
    assertEquals(p.size, sizeForStage(stage));
    assertEquals(p.regions.length, p.size * p.size);
    const solutions = solve(p.size, p.regions, 2);
    assertEquals(solutions.length, 1, `stage ${stage} must have one solution`);
    assertEquals(solutions[0], p.solution);
    assert(regionsConnected(p.size, p.regions), `stage ${stage} regions`);
    assert(isSolved(p, queensAt(p.size, p.solution)));
  }
});

Deno.test("generation is deterministic", () => {
  assertEquals(generate(7, 42), generate(7, 42));
  assertEquals(puzzleForStage(9), puzzleForStage(9));
});

Deno.test("touching queens conflict, even diagonally", () => {
  const p = puzzleForStage(1);
  const marks = new Array<Mark>(25).fill("empty");
  marks[0] = "queen";
  marks[6] = "queen"; // (1,1): diagonal neighbour of (0,0)
  assertEquals([...conflicts(p, marks)].sort(), [0, 6]);
  assertEquals(progress(p, marks), 0);
});

Deno.test("progress counts only rule-abiding queens", () => {
  const p = puzzleForStage(3);
  const marks = queensAt(p.size, p.solution);
  assertEquals(progress(p, marks), 1);
  const half = marks.map((m, i) =>
    Math.floor(i / p.size) < 3 ? m : "empty" as Mark
  );
  assertEquals(progress(p, half), 3 / p.size);
});

Deno.test("attacked covers row, column, region and neighbours", () => {
  const p = puzzleForStage(1);
  const cell = p.solution[0];
  const hit = new Set(attacked(p, cell));
  for (const other of p.solution.map((c, r) => r * p.size + c).slice(1)) {
    assert(!hit.has(other), "the solution's other queens stay free");
  }
  assert(hit.has(cell + p.size)); // straight below
});
