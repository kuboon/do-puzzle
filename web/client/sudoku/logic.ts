/**
 * Sudoku — the rules and the puzzle generator, with no DOM in sight.
 *
 * An N×N grid is split into N boxes of `rows × cols` cells (2×2 for 4×4, 2×3 for 6×6, 3×3 for
 * 9×9). A solution writes `1 … N` so that every row, every column and every box holds each digit
 * exactly once. Every puzzle this module hands out has exactly one solution.
 *
 * Puzzles are generated, not stored: stage `n` is a pure function of `n`, so stage 12 is the same
 * grid for everyone — on the server that renders the page and in the browser that plays it.
 */

import { rng, shuffle } from "../_shared/rng.ts";

/** One puzzle. Cells are numbered row-major: `row * size + col`. */
export interface Puzzle {
  size: number;
  /** Box height. */
  boxRows: number;
  /** Box width. */
  boxCols: number;
  /** The clues: `1 … size`, or `0` for a blank the player fills. */
  givens: number[];
  /** The one solution. */
  solution: number[];
}

/** The box shape for a grid size. */
export function boxShape(size: number): { rows: number; cols: number } {
  switch (size) {
    case 4:
      return { rows: 2, cols: 2 };
    case 6:
      return { rows: 2, cols: 3 };
    case 9:
      return { rows: 3, cols: 3 };
    default:
      throw new Error(`no box shape for ${size}`);
  }
}

/** The grid size for a stage: a 4×4 to learn on, two 6×6, then 9×9. */
export function sizeForStage(stage: number): number {
  if (stage <= 1) return 4;
  if (stage <= 3) return 6;
  return 9;
}

/**
 * How many clues a stage aims for. Fewer clues, harder grid: 9×9 starts generous at 40 and loses
 * one a stage down to 26. The generator never removes a clue that would allow a second solution,
 * so a grid may keep a few more than this.
 */
export function cluesForStage(stage: number): number {
  const size = sizeForStage(stage);
  if (size === 4) return 6;
  if (size === 6) return stage <= 2 ? 16 : 13;
  return Math.max(26, 40 - (stage - 4));
}

/** The puzzle for a stage. Deterministic. */
export function puzzleForStage(stage: number): Puzzle {
  return generate(sizeForStage(stage), cluesForStage(stage), stage * 7907 + 3);
}

/** Which box a cell is in. */
export function boxOf(
  size: number,
  boxRows: number,
  boxCols: number,
  cell: number,
): number {
  const r = Math.floor(cell / size);
  const c = cell % size;
  return Math.floor(r / boxRows) * (size / boxCols) + Math.floor(c / boxCols);
}

/** The cells of each row, column and box. */
export interface Units {
  rows: number[][];
  cols: number[][];
  boxes: number[][];
}

const unitCache = new Map<string, Units>();

export function units(size: number, boxRows: number, boxCols: number): Units {
  const key = `${size}:${boxRows}:${boxCols}`;
  const cached = unitCache.get(key);
  if (cached) return cached;
  const rows: number[][] = Array.from({ length: size }, () => []);
  const cols: number[][] = Array.from({ length: size }, () => []);
  const boxes: number[][] = Array.from({ length: size }, () => []);
  for (let i = 0; i < size * size; i++) {
    rows[Math.floor(i / size)].push(i);
    cols[i % size].push(i);
    boxes[boxOf(size, boxRows, boxCols, i)].push(i);
  }
  const out = { rows, cols, boxes };
  unitCache.set(key, out);
  return out;
}

/** Every other cell that shares a row, column or box with `cell`. */
export function peers(puzzle: Puzzle, cell: number): number[] {
  const { size, boxRows, boxCols } = puzzle;
  const u = units(size, boxRows, boxCols);
  const set = new Set([
    ...u.rows[Math.floor(cell / size)],
    ...u.cols[cell % size],
    ...u.boxes[boxOf(size, boxRows, boxCols, cell)],
  ]);
  set.delete(cell);
  return [...set];
}

/**
 * Finds solutions, stopping once `limit` are found.
 *
 * Bitmask backtracking that always fills the cell with the fewest candidates first.
 *
 * @param grid `0` for blank
 * @returns Up to `limit` complete grids
 */
export function solve(
  size: number,
  boxRows: number,
  boxCols: number,
  grid: readonly number[],
  limit = 2,
  random?: () => number,
): number[][] {
  const cells = [...grid];
  const rowMask = new Array<number>(size).fill(0);
  const colMask = new Array<number>(size).fill(0);
  const boxMask = new Array<number>(size).fill(0);
  const boxIndex = cells.map((_, i) => boxOf(size, boxRows, boxCols, i));
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (!v) continue;
    const bit = 1 << v;
    const r = Math.floor(i / size), c = i % size, b = boxIndex[i];
    if ((rowMask[r] | colMask[c] | boxMask[b]) & bit) return [];
    rowMask[r] |= bit;
    colMask[c] |= bit;
    boxMask[b] |= bit;
  }
  const all = ((1 << (size + 1)) - 1) & ~1;
  const found: number[][] = [];

  const walk = (): void => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 99;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) continue;
      const mask = all &
        ~(rowMask[Math.floor(i / size)] | colMask[i % size] |
          boxMask[boxIndex[i]]);
      const count = popcount(mask);
      if (count < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    if (best === -1) {
      found.push([...cells]);
      return;
    }
    if (bestCount === 0) return;
    const digits: number[] = [];
    for (let d = 1; d <= size; d++) if (bestMask & (1 << d)) digits.push(d);
    if (random) shuffle(digits, random);
    const r = Math.floor(best / size), c = best % size, b = boxIndex[best];
    for (const d of digits) {
      const bit = 1 << d;
      cells[best] = d;
      rowMask[r] |= bit;
      colMask[c] |= bit;
      boxMask[b] |= bit;
      walk();
      rowMask[r] &= ~bit;
      colMask[c] &= ~bit;
      boxMask[b] &= ~bit;
      cells[best] = 0;
      if (found.length >= limit) return;
    }
  };
  walk();
  return found;
}

function popcount(n: number): number {
  let count = 0;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}

/**
 * Generates a puzzle with exactly one solution.
 *
 * 1. Fill an empty grid at random — a solver with shuffled digit order does it.
 * 2. Walk the cells in random order, taking out each one together with its mirror through the
 *    centre (so the clues look tidy), and put them back if the grid stops having one solution.
 *    Stop once the clues are down to `clues`.
 */
export function generate(size: number, clues: number, seed: number): Puzzle {
  const random = rng(seed);
  const { rows: boxRows, cols: boxCols } = boxShape(size);
  const empty = new Array<number>(size * size).fill(0);
  const solution = solve(size, boxRows, boxCols, empty, 1, random)[0];
  const givens = [...solution];
  let left = size * size;
  const half = Math.ceil((size * size) / 2);
  const order = shuffle([...Array(half).keys()], random);
  for (const cell of order) {
    if (left <= clues) break;
    const mirror = size * size - 1 - cell;
    const pair = cell === mirror ? [cell] : [cell, mirror];
    if (left - pair.length < clues) continue;
    const saved = pair.map((i) => givens[i]);
    for (const i of pair) givens[i] = 0;
    if (solve(size, boxRows, boxCols, givens, 2).length === 1) {
      left -= pair.length;
    } else pair.forEach((i, k) => (givens[i] = saved[k]));
  }
  return { size, boxRows, boxCols, givens, solution };
}

/** Whether every cell holds the solution's digit. */
export function isSolved(puzzle: Puzzle, values: readonly number[]): boolean {
  return values.every((v, i) => v === puzzle.solution[i]);
}

/** The cells the player has to fill. */
export function blanks(puzzle: Puzzle): number {
  return puzzle.givens.filter((v) => v === 0).length;
}

/**
 * How close the grid is to done, `0 … 1`: the share of blanks filled.
 *
 * A wrong digit never stays on the grid (see {@link judge}), so every digit there is plainly right
 * and counting them gives nothing away.
 */
export function progress(puzzle: Puzzle, values: readonly number[]): number {
  const total = blanks(puzzle);
  if (total === 0) return 1;
  let filled = 0;
  values.forEach((v, i) => {
    if (v && !puzzle.givens[i]) filled++;
  });
  return Math.min(1, filled / total);
}

/** A row, column or box that is now full. */
export interface DoneUnit {
  kind: "row" | "col" | "box";
  cells: number[];
}

/** The units through `cell` that are full. */
export function completedUnits(
  puzzle: Puzzle,
  values: readonly number[],
  cell: number,
): DoneUnit[] {
  const { size, boxRows, boxCols } = puzzle;
  const u = units(size, boxRows, boxCols);
  const out: DoneUnit[] = [];
  const full = (cells: number[]) => cells.every((i) => values[i] !== 0);
  const row = u.rows[Math.floor(cell / size)];
  const col = u.cols[cell % size];
  const box = u.boxes[boxOf(size, boxRows, boxCols, cell)];
  if (full(row)) out.push({ kind: "row", cells: row });
  if (full(col)) out.push({ kind: "col", cells: col });
  if (full(box)) out.push({ kind: "box", cells: box });
  return out;
}

/** How many of `digit` are on the grid. */
export function countDigit(values: readonly number[], digit: number): number {
  return values.filter((v) => v === digit).length;
}

/**
 * The digits a blank could still take, as a bitmask (`1 << d`), going only by what is on the
 * grid. Used by the "fill in every note" assist.
 */
export function candidates(
  puzzle: Puzzle,
  values: readonly number[],
  cell: number,
): number {
  let mask = 0;
  for (let d = 1; d <= puzzle.size; d++) mask |= 1 << d;
  for (const p of peers(puzzle, cell)) if (values[p]) mask &= ~(1 << values[p]);
  return mask;
}

/** Hearts a stage starts with. */
export const MAX_LIVES = 3;

/** What writing a digit does. */
export type Verdict =
  | { kind: "ok" }
  | { kind: "miss"; lives: number }
  | { kind: "over" };

/**
 * Judges a digit against the one solution.
 *
 * Right: it stays. Wrong: a heart is lost and the cell stays blank. Wrong with no hearts left:
 * game over.
 */
export function judge(
  puzzle: Puzzle,
  cell: number,
  digit: number,
  lives: number,
): Verdict {
  if (puzzle.solution[cell] === digit) return { kind: "ok" };
  return lives > 0 ? { kind: "miss", lives: lives - 1 } : { kind: "over" };
}
