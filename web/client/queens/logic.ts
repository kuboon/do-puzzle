/**
 * Queens — the rules and the puzzle generator, with no DOM in sight.
 *
 * An N×N board is split into N coloured regions. A solution puts N queens on it so that every
 * row, every column and every region holds exactly one, and no two queens touch — not even at a
 * corner. Every puzzle this module hands out has exactly one solution.
 *
 * Puzzles are generated, not stored: stage `n` is `generate(sizeForStage(n), n)`, and the
 * generator is a pure function of its seed, so stage 12 is the same board for everyone — on the
 * server that renders the page and in the browser that plays it.
 */

/** One puzzle. Cells are numbered row-major: `row * size + col`. */
export interface Puzzle {
  size: number;
  /** The region each cell belongs to, `0 … size - 1`. */
  regions: number[];
  /** The one solution: the column of the queen in each row. */
  solution: number[];
}

/** What the player has put on a cell. */
export type Mark = "empty" | "cross" | "queen";

/** A small seeded PRNG (mulberry32): the same seed always gives the same board. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The board size for a stage: small boards first, bigger ones as the stages go on. */
export function sizeForStage(stage: number): number {
  if (stage <= 2) return 5;
  if (stage <= 5) return 6;
  if (stage <= 9) return 7;
  if (stage <= 14) return 8;
  if (stage <= 24) return 9;
  return 10;
}

/** The puzzle for a stage. Deterministic. */
export function puzzleForStage(stage: number): Puzzle {
  return generate(sizeForStage(stage), stage * 7919 + 17);
}

/**
 * Counts solutions, stopping once `limit` are found.
 *
 * @returns Up to `limit` solutions, each as the column per row
 */
export function solve(
  size: number,
  regions: readonly number[],
  limit = 2,
): number[][] {
  const found: number[][] = [];
  const cols: number[] = [];
  const walk = (row: number, colMask: number, regionMask: number) => {
    if (found.length >= limit) return;
    if (row === size) {
      found.push([...cols]);
      return;
    }
    const prev = row > 0 ? cols[row - 1] : -10;
    for (let c = 0; c < size; c++) {
      if (colMask & (1 << c)) continue;
      if (Math.abs(c - prev) <= 1) continue;
      const r = regions[row * size + c];
      if (regionMask & (1 << r)) continue;
      cols[row] = c;
      walk(row + 1, colMask | (1 << c), regionMask | (1 << r));
      if (found.length >= limit) return;
    }
  };
  walk(0, 0, 0);
  return found;
}

/**
 * Generates a puzzle with exactly one solution.
 *
 * 1. Place N non-touching queens, one per row and column, at random.
 * 2. Grow one region from each queen until the board is covered.
 * 3. While another solution exists, take one of its queens that is not on the real solution and
 *    hand that cell to a neighbouring region — which puts two of the impostor's queens in one
 *    region and kills it. If that gets stuck, start over.
 */
export function generate(size: number, seed: number): Puzzle {
  const random = rng(seed);
  for (let attempt = 0;; attempt++) {
    const solution = placeQueens(size, random);
    const regions = growRegions(size, solution, random);
    if (repair(size, regions, solution, random)) {
      return { size, regions: relabel(regions), solution };
    }
    if (attempt > 500) throw new Error(`could not generate a ${size} board`);
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function placeQueens(size: number, random: () => number): number[] {
  const cols: number[] = [];
  const used = new Set<number>();
  const walk = (row: number): boolean => {
    if (row === size) return true;
    const order = shuffle([...Array(size).keys()], random);
    for (const c of order) {
      if (used.has(c)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c;
      used.add(c);
      if (walk(row + 1)) return true;
      used.delete(c);
    }
    return false;
  };
  walk(0);
  return cols;
}

function neighbours(size: number, cell: number): number[] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

function growRegions(
  size: number,
  solution: readonly number[],
  random: () => number,
): number[] {
  const regions = new Array<number>(size * size).fill(-1);
  solution.forEach((c, r) => (regions[r * size + c] = r));
  let left = size * size - size;
  while (left > 0) {
    // Pick a random unassigned cell next to some region and join one of its neighbours' regions.
    const frontier: number[] = [];
    for (let i = 0; i < regions.length; i++) {
      if (
        regions[i] === -1 &&
        neighbours(size, i).some((n) => regions[n] !== -1)
      ) frontier.push(i);
    }
    const cell = frontier[Math.floor(random() * frontier.length)];
    const owners = neighbours(size, cell).filter((n) => regions[n] !== -1);
    regions[cell] = regions[owners[Math.floor(random() * owners.length)]];
    left--;
  }
  return regions;
}

/** Whether a region is still in one piece once `without` leaves it. */
function connectedWithout(
  size: number,
  regions: readonly number[],
  region: number,
  without: number,
): boolean {
  const cells = regions
    .map((r, i) => (r === region && i !== without ? i : -1))
    .filter((i) => i !== -1);
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const cell = stack.pop()!;
    for (const n of neighbours(size, cell)) {
      if (n !== without && regions[n] === region && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

function repair(
  size: number,
  regions: number[],
  solution: readonly number[],
  random: () => number,
): boolean {
  const queenCells = new Set(solution.map((c, r) => r * size + c));
  for (let step = 0; step < size * size * 2; step++) {
    const other = solve(size, regions, 2).find((s) =>
      s.some((c, r) => c !== solution[r])
    );
    if (!other) return true;
    const moves: [number, number][] = [];
    other.forEach((c, r) => {
      const cell = r * size + c;
      if (queenCells.has(cell)) return;
      for (const n of neighbours(size, cell)) {
        const target = regions[n];
        if (target === regions[cell]) continue;
        if (!connectedWithout(size, regions, regions[cell], cell)) continue;
        moves.push([cell, target]);
      }
    });
    if (moves.length === 0) return false;
    const [cell, target] = moves[Math.floor(random() * moves.length)];
    regions[cell] = target;
  }
  return false;
}

/** Renumbers regions in reading order, so region 0 is the one at the top-left. */
function relabel(regions: readonly number[]): number[] {
  const map = new Map<number, number>();
  for (const r of regions) if (!map.has(r)) map.set(r, map.size);
  return regions.map((r) => map.get(r)!);
}

/**
 * Which cells' queens break a rule: two in a row, column or region, or two touching.
 *
 * @returns The set of cells holding a queen that conflicts with another
 */
export function conflicts(
  puzzle: Puzzle,
  marks: readonly Mark[],
): Set<number> {
  const { size, regions } = puzzle;
  const queens = marks
    .map((m, i) => (m === "queen" ? i : -1))
    .filter((i) => i !== -1);
  const bad = new Set<number>();
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i];
      const b = queens[j];
      const ar = Math.floor(a / size), ac = a % size;
      const br = Math.floor(b / size), bc = b % size;
      if (
        ar === br || ac === bc || regions[a] === regions[b] ||
        (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
      ) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  return bad;
}

/** Whether the marks are a solution: N queens and no conflicts. */
export function isSolved(puzzle: Puzzle, marks: readonly Mark[]): boolean {
  const queens = marks.filter((m) => m === "queen").length;
  return queens === puzzle.size && conflicts(puzzle, marks).size === 0;
}

/**
 * How close the board is to done, `0 … 1`: the share of queens placed that break no rule.
 *
 * It drives how loud the effects are, so it only counts what is plainly right on the board — it
 * never peeks at the solution, which would give away whether a queen is correct.
 */
export function progress(puzzle: Puzzle, marks: readonly Mark[]): number {
  const bad = conflicts(puzzle, marks);
  let good = 0;
  marks.forEach((m, i) => {
    if (m === "queen" && !bad.has(i)) good++;
  });
  return Math.min(1, good / puzzle.size);
}

/**
 * The cells a queen rules out: its row, column, region and the eight around it.
 *
 * Used for the auto-cross assist.
 */
export function attacked(puzzle: Puzzle, cell: number): number[] {
  const { size, regions } = puzzle;
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (i === cell) continue;
    const ir = Math.floor(i / size), ic = i % size;
    if (
      ir === r || ic === c || regions[i] === regions[cell] ||
      (Math.abs(ir - r) <= 1 && Math.abs(ic - c) <= 1)
    ) out.push(i);
  }
  return out;
}

/** Hearts a stage starts with. */
export const MAX_LIVES = 3;

/** What placing a queen does. */
export type Verdict =
  | { kind: "queen" }
  | { kind: "miss"; lives: number }
  | { kind: "over" };

/**
 * Judges a queen against the one solution.
 *
 * Right: the queen stays. Wrong: a heart is lost and the cell becomes ×. Wrong with no hearts
 * left: game over.
 */
export function judgeQueen(
  puzzle: Puzzle,
  cell: number,
  lives: number,
): Verdict {
  const row = Math.floor(cell / puzzle.size);
  if (puzzle.solution[row] === cell % puzzle.size) return { kind: "queen" };
  return lives > 0 ? { kind: "miss", lives: lives - 1 } : { kind: "over" };
}
