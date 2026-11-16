/**
 * ドパ数独 — the playable grid, as an island.
 *
 * The server renders stage 1 (or whatever stage it is handed) so the grid is there before any
 * script runs; once hydrated, the island switches to the stage in `?stage=` or the one the player
 * was last on, kept in `localStorage`.
 *
 * Input:
 *
 * - **Tap a cell** to select it, then **tap a digit** on the pad (or type it) to write it. A digit
 *   is judged on the spot: the right one stays; the wrong one costs a ❤ and does not stay. A miss
 *   with no ❤ left is game over. So every digit on the grid is right.
 * - **メモ** switches the pad to pencil marks: a digit toggles a small note instead.
 * - Keyboard: digits, arrow keys, Backspace / Delete (clear notes), `M` (notes), `Ctrl+Z` (undo).
 *
 * Everything the player does goes through {@link react}, which works out the grid's heat — how
 * many blanks are filled — and fires effects scaled by it. Finishing a row, column or box sets off
 * a chain along it; the last blank is the loudest move in the game; the clear is louder still. See
 * `client/_shared/fx.ts` and the house rule in `CLAUDE.md`.
 */

import {
  clientEntry,
  css,
  type Handle,
  on,
  ref,
  type SerializableValue,
} from "@remix-run/component";

import { createFx, type Fx, RAINBOW } from "../_shared/fx.ts";
import { lockZoom } from "../_shared/no_zoom.ts";
import { createMusic, type Music, musicLevel } from "../_shared/music.ts";
import { color, radius } from "../_shared/tokens.ts";
import {
  blanks,
  boxOf,
  candidates,
  completedUnits,
  countDigit,
  type DoneUnit,
  isSolved,
  judge,
  MAX_LIVES,
  peers,
  progress,
  type Puzzle,
  puzzleForStage,
} from "./logic.ts";
import { song } from "./song.ts";

export interface SudokuProps {
  stage: number;
  [key: string]: SerializableValue;
}

/** What the pop-up says for a run of quick digits. Escalates. */
const SHOUTS = [
  "NICE!",
  "GOOD!",
  "GREAT!",
  "SUPER!",
  "AWESOME!",
  "AMAZING!",
  "INCREDIBLE!",
  "LEGENDARY!",
  "GODLIKE!",
];

/** Digits written within this long of each other build a combo. */
const COMBO_MS = 4000;

const UNIT_NAMES: Record<DoneUnit["kind"], string> = {
  row: "ROW",
  col: "COLUMN",
  box: "BLOCK",
};

const MULTI = ["", "", "DOUBLE!!", "TRIPLE!!!"];

const STORE_STAGE = "sudoku:stage";
const STORE_BEST = "sudoku:best";
const STORE_SOUND = "sudoku:sound";
const STORE_BGM = "sudoku:bgm";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode, blocked storage: the game still plays, it just forgets.
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Snapshot {
  values: number[];
  notes: number[];
}

export const SudokuGame = clientEntry(
  import.meta.url,
  function SudokuGame(handle: Handle<SudokuProps>) {
    let stage = handle.props.stage;
    let puzzle: Puzzle = puzzleForStage(stage);
    let values: number[] = [];
    /** Pencil marks per cell, as a bitmask: bit `d` is note `d`. */
    let notes: number[] = [];
    let history: Snapshot[] = [];
    let selected = -1;
    let noteMode = false;
    let cleared = false;
    let over = false;
    let lives = MAX_LIVES;
    let best = 0;
    let soundOn = true;
    let bgmOn = true;
    let music: Music | null = null;
    let startedAt = 0;
    let finishedIn = 0;
    let combo = 0;
    let lastPlaced = 0;
    /** A wrong digit, shown in red for a moment. */
    let wrong: { cell: number; digit: number } | null = null;
    let wrongTimer: ReturnType<typeof setTimeout> | undefined;
    let fx: Fx | null = null;
    let board: HTMLElement | null = null;
    let clock: HTMLElement | null = null;

    function reset(next: number): void {
      stage = next;
      puzzle = puzzleForStage(stage);
      values = [...puzzle.givens];
      notes = new Array<number>(values.length).fill(0);
      history = [];
      selected = -1;
      cleared = false;
      over = false;
      lives = MAX_LIVES;
      startedAt = 0;
      finishedIn = 0;
      combo = 0;
      wrong = null;
      setHeat(0);
    }

    /** Feeds the grid's heat to the effects and the music. */
    function setHeat(heat: number): void {
      fx?.setHeat(heat);
      const total = blanks(puzzle);
      music?.setLevel(
        musicLevel(Math.round(heat * total), total, song.hype.length),
      );
    }
    reset(stage);

    function goTo(next: number): void {
      reset(Math.max(1, next));
      save(STORE_STAGE, String(stage));
      try {
        const url = new URL(location.href);
        url.searchParams.set("stage", String(stage));
        globalThis.history.replaceState(null, "", url);
      } catch {
        // No history API: the stage is still right on screen.
      }
      void handle.update();
    }

    /** The middle of a cell, in viewport coordinates. */
    function centre(cell: number): { x: number; y: number } {
      const el = board?.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
      const r = el?.getBoundingClientRect();
      return r
        ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        : { x: innerWidth / 2, y: innerHeight / 2 };
    }

    function snapshot(): void {
      history.push({ values: [...values], notes: [...notes] });
      if (history.length > 300) history.shift();
    }

    /** Effects for one right digit, scaled by how close the grid is to done. */
    function react(cell: number, digit: number): void {
      if (!fx || !board) return;
      const heat = progress(puzzle, values);
      setHeat(heat);
      const { x, y } = centre(cell);
      const total = blanks(puzzle);
      const good = Math.round(heat * total);
      const left = total - good;
      const now = performance.now();
      combo = now - lastPlaced < COMBO_MS ? combo + 1 : 1;
      lastPlaced = now;
      const h2 = heat * heat;
      const tint = RAINBOW[(digit - 1) % RAINBOW.length];

      fx.burst(x, y, {
        count: 20 + 160 * h2,
        colors: heat > 0.5 ? [tint, ...RAINBOW, "#ffffff"] : [tint, "#ffffff"],
        speed: 5 + 14 * heat,
        life: 40 + 45 * heat,
        size: 3 + 3 * heat,
      });
      if (heat > 0.5) {
        fx.burst(x, y, {
          count: 10 + 60 * h2,
          shape: "star",
          speed: 5 + 8 * heat,
          life: 60,
          size: 5 + 6 * heat,
        });
      }
      fx.ring(x, y, tint, 50 + 220 * heat);
      if (heat > 0.7) fx.ring(x, y, "#ffffff", 120 + 380 * h2);
      fx.shake(board, 2 + 14 * h2, 250 + 250 * heat);
      if (heat > 0.8) fx.shake(document.body, 3 + 8 * h2, 350);
      fx.flash(tint, 0.05 + 0.3 * h2, 180 + 180 * heat);
      fx.sound("place", heat, Math.min(12, Math.floor(heat * 12)));

      const done = completedUnits(puzzle, values, cell);
      done.forEach((unit, k) => {
        const local = fx!;
        setTimeout(() => {
          local.chain(unit.cells.map(centre), {
            heat: Math.max(0.4, heat),
            startStep: k * 2,
            stepMs: 40,
          });
        }, k * 180);
      });
      if (done.length > 0) {
        fx.shake(board, 8 + 14 * heat + 6 * done.length, 500);
        fx.flash("#ffffff", 0.15 + 0.15 * done.length, 250);
      }

      const digitDone = countDigit(values, digit) === puzzle.size;
      if (digitDone) {
        values.forEach((v, i) => {
          if (v !== digit) return;
          const p = centre(i);
          fx!.burst(p.x, p.y, {
            count: 12 + 20 * heat,
            shape: "star",
            colors: [tint, "#ffffff"],
            speed: 6,
            life: 50,
            size: 6,
          });
        });
      }

      if (isSolved(puzzle, values)) {
        win();
        return;
      }

      // One pop-up per move, the most important thing first.
      const shout = left === 1
        ? "ONE MORE!!"
        : done.length >= 2
        ? `${MULTI[done.length]} ${
          done.map((u) => UNIT_NAMES[u.kind]).join("+")
        }`
        : done.length === 1
        ? `${UNIT_NAMES[done[0].kind]} CLEAR!`
        : digitDone
        ? `${digit} COMPLETE!`
        : left <= 5
        ? `あと ${left}!`
        : SHOUTS[Math.min(combo - 1, SHOUTS.length - 1)];
      fx.popText(x, y - 30, shout, {
        size: (left === 1 ? 44 : 20) + 40 * heat + 8 * done.length,
        color: tint,
        rainbow: heat > 0.6 || done.length > 0 || left === 1,
        ms: 700 + 700 * heat,
      });
      if (combo >= 3) {
        fx.popText(x, y + 30, `COMBO ×${combo}`, {
          size: 18 + Math.min(30, 4 * combo),
          color: "#ffd400",
          rainbow: combo >= 6,
        });
      }
    }

    function win(): void {
      cleared = true;
      selected = -1;
      music?.fanfare();
      finishedIn = performance.now() - startedAt;
      best = Math.max(best, stage);
      save(STORE_BEST, String(best));
      save(STORE_STAGE, String(stage + 1));
      if (fx && board) {
        const target = board;
        const local = fx;
        void local.celebrate(target, 1 + Math.min(stage, 20) * 0.05);
        // A diagonal wave runs across the grid, top-left to bottom-right.
        const { size } = puzzle;
        for (let d = 0; d < size * 2 - 1; d++) {
          setTimeout(() => {
            for (let r = 0; r < size; r++) {
              const c = d - r;
              if (c < 0 || c >= size) continue;
              const { x, y } = centre(r * size + c);
              local.burst(x, y, {
                count: 10,
                shape: "star",
                colors: [RAINBOW[d % RAINBOW.length], "#ffffff"],
                speed: 8,
                life: 70,
                size: 6,
              });
            }
            if (d % 2 === 0) local.sound("place", 1, Math.floor(d / 2) + 2);
          }, 250 + d * 60);
        }
        setTimeout(() => {
          const r = target.getBoundingClientRect();
          local.popText(
            r.left + r.width / 2,
            r.top + r.height / 2,
            "STAGE CLEAR!!",
            { size: Math.min(72, r.width / 6), rainbow: true, ms: 2200 },
          );
        }, 300);
      }
      void handle.update();
    }

    /** A wrong digit: a heart breaks, and the digit flashes red and goes. */
    function miss(cell: number, digit: number): void {
      combo = 0;
      wrong = { cell, digit };
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => {
        wrong = null;
        void handle.update();
      }, 650);
      if (!fx || !board) return;
      const { x, y } = centre(cell);
      fx.sound("error");
      fx.shake(board, 18, 450);
      fx.flash("#ff0033", 0.35, 350);
      fx.burst(x, y, {
        count: 60,
        colors: ["#ff0033", "#ff5a7a", "#330000"],
        speed: 9,
        life: 45,
      });
      fx.ring(x, y, "#ff0033", 160);
      fx.popText(x, y - 24, lives === 0 ? "💔 LAST CHANCE!" : "💔 MISS", {
        color: "#ff3355",
        size: lives === 0 ? 34 : 40,
        ms: 1100,
      });
    }

    function gameOver(cell: number, digit: number): void {
      over = true;
      wrong = { cell, digit };
      finishedIn = performance.now() - startedAt;
      combo = 0;
      music?.stop();
      fx?.setHeat(0);
      if (fx && board) void fx.defeat(board);
    }

    /** Whether the selected cell takes input. */
    function open(cell: number): boolean {
      return cell >= 0 && !cleared && !over && values[cell] === 0;
    }

    /** A digit from the pad or the keyboard. */
    function input(digit: number): void {
      if (!open(selected) || digit < 1 || digit > puzzle.size) return;
      const cell = selected;
      if (startedAt === 0) startedAt = performance.now();
      if (noteMode) {
        snapshot();
        notes[cell] ^= 1 << digit;
        fx?.sound("cross");
        void handle.update();
        return;
      }
      const verdict = judge(puzzle, cell, digit, lives);
      if (verdict.kind === "ok") {
        snapshot();
        values[cell] = digit;
        notes[cell] = 0;
        // The digit is right, so no peer can hold it: its note goes from all of them.
        for (const p of peers(puzzle, cell)) notes[p] &= ~(1 << digit);
        react(cell, digit);
      } else if (verdict.kind === "miss") {
        lives = verdict.lives;
        miss(cell, digit);
      } else gameOver(cell, digit);
      void handle.update();
    }

    function select(cell: number): void {
      if (cleared || over) return;
      selected = cell;
      fx?.sound("tick");
      void handle.update();
    }

    /** Clears the selected cell's notes. */
    function erase(): void {
      if (!open(selected) || notes[selected] === 0) return;
      snapshot();
      notes[selected] = 0;
      void handle.update();
    }

    /** Writes every candidate into every blank, going by what is on the grid. */
    function fillNotes(): void {
      if (cleared || over) return;
      snapshot();
      values.forEach((v, i) => {
        notes[i] = v ? 0 : candidates(puzzle, values, i);
      });
      if (board) fx?.shake(board, 6);
      fx?.sound("cross", 0.5);
      void handle.update();
    }

    function undo(): void {
      const prev = history.pop();
      if (!prev || cleared || over) return;
      values = prev.values;
      notes = prev.notes;
      setHeat(progress(puzzle, values));
      fx?.sound("tick");
      void handle.update();
    }

    function retry(): void {
      reset(stage);
      void handle.update();
    }

    function toggleNotes(): void {
      noteMode = !noteMode;
      void handle.update();
    }

    function toggleBgm(): void {
      bgmOn = !bgmOn;
      music?.setMuted(!bgmOn);
      save(STORE_BGM, bgmOn ? "on" : "off");
      void handle.update();
    }

    function toggleSound(): void {
      soundOn = !soundOn;
      fx?.setMuted(!soundOn);
      save(STORE_SOUND, soundOn ? "on" : "off");
      void handle.update();
    }

    function onKey(event: KeyboardEvent): void {
      if (event.altKey || event.metaKey) return;
      if (event.ctrlKey) {
        if (event.key === "z") {
          event.preventDefault();
          undo();
        }
        return;
      }
      const { size } = puzzle;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= size) {
        event.preventDefault();
        input(digit);
        return;
      }
      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        const cur = selected < 0 ? 0 : selected;
        const r = (Math.floor(cur / size) + move[0] + size) % size;
        const c = (cur % size + move[1] + size) % size;
        select(selected < 0 ? 0 : r * size + c);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        erase();
      } else if (event.key === "m" || event.key === "M") toggleNotes();
    }

    handle.queueTask(() => {
      const params = new URL(location.href).searchParams;
      best = Number(load(STORE_BEST) ?? 0) || 0;
      soundOn = load(STORE_SOUND) !== "off";
      bgmOn = load(STORE_BGM) !== "off";
      const wanted = Number(params.get("stage") ?? load(STORE_STAGE) ?? 1);
      const start = Number.isInteger(wanted) && wanted >= 1
        ? Math.min(wanted, best + 1)
        : 1;
      if (start !== stage) reset(start);

      lockZoom(handle.signal);
      fx = createFx();
      fx.setMuted(!soundOn);
      handle.signal.addEventListener("abort", () => fx?.destroy());
      music = createMusic(song);
      music.setMuted(!bgmOn);
      handle.signal.addEventListener("abort", () => music?.destroy());

      globalThis.addEventListener("keydown", onKey, { signal: handle.signal });
      const timer = setInterval(() => {
        if (!clock) return;
        clock.textContent = formatTime(
          cleared || over
            ? finishedIn
            : startedAt
            ? performance.now() - startedAt
            : 0,
        );
      }, 250);
      handle.signal.addEventListener("abort", () => {
        clearInterval(timer);
        clearTimeout(wrongTimer);
      });
      void handle.update();
    });

    return () => {
      const { size, boxRows, boxCols } = puzzle;
      const heat = progress(puzzle, values);
      const total = blanks(puzzle);
      const left = total - Math.round(heat * total);
      const focusDigit = selected >= 0 ? values[selected] : 0;
      const peerSet = new Set(selected >= 0 ? peers(puzzle, selected) : []);
      const boxesAcross = size / boxCols;

      return (
        <section mix={wrapStyle} aria-label="ドパ数独">
          <div mix={barStyle}>
            <div mix={stageStyle}>
              <button
                type="button"
                aria-label="previous stage"
                mix={[navButtonStyle, on("click", () => goTo(stage - 1))]}
                disabled={stage <= 1}
              >
                ◀
              </button>
              <span>
                STAGE <strong mix={stageNumberStyle}>{stage}</strong>
                <small mix={sizeStyle}>{size}×{size}</small>
              </span>
              <button
                type="button"
                aria-label="next stage"
                mix={[navButtonStyle, on("click", () => goTo(stage + 1))]}
                disabled={stage > best}
              >
                ▶
              </button>
            </div>
            <span
              mix={livesStyle}
              role="img"
              aria-label={`残りハート ${lives}`}
            >
              {Array.from({ length: MAX_LIVES }, (_, i) => (
                <span
                  key={`${i}-${i < lives}`}
                  mix={i < lives ? heartStyle : heartLostStyle}
                >
                  {i < lives ? "❤" : "🖤"}
                </span>
              ))}
            </span>
            <span mix={clockStyle}>
              ⏱{" "}
              <span mix={ref((node) => (clock = node as HTMLElement))}>
                0:00
              </span>
            </span>
          </div>

          <div mix={meterStyle} aria-hidden="true">
            <span
              mix={meterFillStyle}
              style={{ width: `${Math.round(heat * 100)}%` }}
            />
            <span mix={meterLabelStyle}>
              {left === 0 ? "COMPLETE!" : `あと ${left} マス`}
            </span>
          </div>

          <div
            role="grid"
            aria-label={`${size}×${size} の盤面`}
            mix={[
              ref((node) => (board = node as HTMLElement)),
              boardStyle,
              heat >= 0.8 ? hotStyle : null,
              over ? deadStyle : null,
              on("contextmenu", (e) => e.preventDefault()),
            ]}
            style={{
              gridTemplateColumns: `repeat(${size}, 1fr)`,
              "--n": String(size),
              "--board-heat": String(heat),
            }}
          >
            {values.map((value, i) => {
              const r = Math.floor(i / size);
              const c = i % size;
              const box = boxOf(size, boxRows, boxCols, i);
              const shaded =
                (Math.floor(box / boxesAcross) + box % boxesAcross) % 2 === 1;
              const given = puzzle.givens[i] !== 0;
              const bad = wrong?.cell === i ? wrong.digit : 0;
              // Box edges thick, cell edges hairline; the board's own border is the outside.
              const line = (edge: boolean, thick: boolean) =>
                !edge ? "0" : thick ? "3.5px" : "1px";
              return (
                <button
                  key={`${stage}-${i}`}
                  type="button"
                  role="gridcell"
                  data-cell={String(i)}
                  aria-selected={selected === i ? "true" : "false"}
                  aria-label={`${r + 1}行${c + 1}列 ${value || "空"}`}
                  mix={[
                    cellStyle,
                    shaded ? shadedStyle : null,
                    peerSet.has(i) ? peerStyle : null,
                    focusDigit && value === focusDigit ? sameStyle : null,
                    selected === i ? selectedStyle : null,
                    bad ? badStyle : null,
                    on("click", () => select(i)),
                  ]}
                  style={{
                    "--bt": line(r > 0, r % boxRows === 0),
                    "--bl": line(c > 0, c % boxCols === 0),
                  }}
                >
                  {bad
                    ? <span key={`w${bad}`} mix={wrongDigitStyle}>{bad}</span>
                    : value
                    ? (
                      <span
                        key={`v${value}`}
                        mix={given ? givenStyle : playerStyle}
                      >
                        {value}
                      </span>
                    )
                    : notes[i]
                    ? (
                      <span
                        key="notes"
                        mix={notesStyle}
                        style={{
                          gridTemplateColumns: `repeat(${boxCols}, 1fr)`,
                          gridTemplateRows: `repeat(${boxRows}, 1fr)`,
                        }}
                      >
                        {Array.from({ length: size }, (_, k) => (
                          <span key={k}>
                            {notes[i] & (1 << (k + 1)) ? k + 1 : ""}
                          </span>
                        ))}
                      </span>
                    )
                    : null}
                </button>
              );
            })}
          </div>

          {over
            ? (
              <div mix={endStyle} role="status">
                <p mix={overTitleStyle}>GAME OVER</p>
                <p mix={endTimeStyle}>STAGE {stage}</p>
                <button
                  type="button"
                  mix={[bigButtonStyle, on("click", retry)]}
                >
                  ↻ もう一度
                </button>
              </div>
            )
            : cleared
            ? (
              <div mix={endStyle} role="status">
                <p mix={clearTitleStyle}>STAGE {stage} CLEAR!!</p>
                <p mix={endTimeStyle}>TIME {formatTime(finishedIn)}</p>
                <button
                  type="button"
                  mix={[bigButtonStyle, on("click", () => goTo(stage + 1))]}
                >
                  NEXT STAGE ▶
                </button>
              </div>
            )
            : (
              <>
                <div
                  mix={padStyle}
                  style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
                >
                  {Array.from({ length: size }, (_, k) => {
                    const d = k + 1;
                    const rest = size - countDigit(values, d);
                    return (
                      <button
                        key={`${stage}-${d}`}
                        type="button"
                        data-digit={String(d)}
                        aria-label={noteMode ? `メモ ${d}` : `${d} を書く`}
                        mix={[
                          padButtonStyle,
                          noteMode ? padNoteStyle : null,
                          on("click", () => input(d)),
                        ]}
                        disabled={rest === 0}
                      >
                        <span>{d}</span>
                        <small mix={padRestStyle}>{rest}</small>
                      </button>
                    );
                  })}
                </div>
                <div mix={toolsStyle}>
                  <button
                    type="button"
                    mix={[toolStyle, on("click", undo)]}
                    disabled={history.length === 0}
                  >
                    ↶ 戻す
                  </button>
                  <button
                    type="button"
                    aria-pressed={noteMode ? "true" : "false"}
                    mix={[
                      toolStyle,
                      noteMode ? toolOnStyle : null,
                      on("click", toggleNotes),
                    ]}
                  >
                    ✎ メモ
                  </button>
                  <button
                    type="button"
                    mix={[toolStyle, on("click", erase)]}
                    disabled={!open(selected) || notes[selected] === 0}
                  >
                    ⌫ 消す
                  </button>
                  <button
                    type="button"
                    mix={[toolStyle, on("click", fillNotes)]}
                  >
                    候補を全部
                  </button>
                  <button
                    type="button"
                    aria-pressed={soundOn ? "true" : "false"}
                    aria-label="sound"
                    mix={[
                      toolStyle,
                      soundOn ? toolOnStyle : null,
                      on("click", toggleSound),
                    ]}
                  >
                    {soundOn ? "🔊" : "🔇"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={bgmOn ? "true" : "false"}
                    aria-label="BGM"
                    mix={[
                      toolStyle,
                      bgmOn ? toolOnStyle : null,
                      on("click", toggleBgm),
                    ]}
                  >
                    {bgmOn ? "♪ BGM" : "♪ OFF"}
                  </button>
                </div>
              </>
            )}
          <p mix={hintStyle}>
            マスを選んで数字をタップ。ハズレだと ❤ が減る。✎
            メモで候補を書き込める。
          </p>
        </section>
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

const INK = "#1a1a2e";

const wrapStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.75rem",
  marginBlock: "1rem 2rem",
});

const barStyle = css({
  width: "100%",
  maxWidth: "34rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontWeight: 800,
});

const stageStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "1.1rem",
  letterSpacing: "0.05em",
});

const stageNumberStyle = css({
  fontSize: "1.6rem",
  color: "hsl(calc(var(--fx-hue, 330) * 1deg) 90% 55%)",
});

const sizeStyle = css({ marginInlineStart: "0.4rem", color: color.muted });

const navButtonStyle = css({
  font: "inherit",
  cursor: "pointer",
  border: "none",
  background: "transparent",
  color: color.fg,
  fontSize: "1rem",
  padding: "0.2rem 0.4rem",
  "&:disabled": { opacity: 0.25, cursor: "default" },
  "&:hover:not(:disabled)": { transform: "scale(1.3)" },
});

const clockStyle = css({
  fontVariantNumeric: "tabular-nums",
  fontFamily: "var(--font-mono)",
  fontSize: "1.1rem",
});

const meterStyle = css({
  position: "relative",
  width: "min(100%, 34rem)",
  height: "1.4rem",
  borderRadius: "999px",
  border: `3px solid ${INK}`,
  background: color.bg,
  overflow: "hidden",
});

const meterFillStyle = css({
  position: "absolute",
  inset: "0 auto 0 0",
  backgroundImage:
    "linear-gradient(90deg, #ff3b6b, #ff8a00, #ffd400, #3ddc84, #00c2ff, #6c5cff, #ff4fd8, #ff3b6b)",
  backgroundSize: "200% 100%",
  animation: "fx-slide 2s linear infinite",
  transition: "width 300ms cubic-bezier(.2,.8,.3,1.2)",
});

const meterLabelStyle = css({
  position: "relative",
  display: "block",
  textAlign: "center",
  fontWeight: 900,
  fontSize: "0.8rem",
  lineHeight: "1.1rem",
  color: INK,
  textShadow: "0 0 4px #fff, 0 0 2px #fff",
});

const boardStyle = css({
  display: "grid",
  width: "min(100%, 34rem)",
  aspectRatio: "1",
  // The cells size their digits off the board's width: `100cqi / --n` is one cell.
  containerType: "inline-size",
  border: `4px solid ${INK}`,
  borderRadius: radius.md,
  overflow: "hidden",
  touchAction: "manipulation",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
  background: "#ffffff",
  // The glow follows the heat, and its colour runs round the rainbow at the speed fx.ts sets.
  boxShadow:
    "0 0 calc(var(--board-heat) * 70px) calc(var(--board-heat) * 14px) hsl(calc(var(--fx-hue, 330) * 1deg) 100% 60%), 0 10px 0 #1a1a2e44",
  transition: "box-shadow 300ms ease",
});

/** The last stretch: the whole board throbs. */
const hotStyle = css({
  animation: "fx-throb 0.45s ease-in-out infinite",
  borderColor: "hsl(calc(var(--fx-hue, 330) * 1deg) 100% 50%)",
});

const cellStyle = css({
  position: "relative",
  display: "grid",
  placeItems: "center",
  padding: 0,
  margin: 0,
  border: "none",
  background: "#ffffff",
  // Lines go on an overlay rather than the cell's own border: uneven borders would push the
  // digit off-centre. Each cell draws its top and left; box edges are thick.
  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderStyle: "solid",
    borderColor: INK,
    borderWidth: "var(--bt) 0 0 var(--bl)",
    opacity: 0.9,
    pointerEvents: "none",
  },
  font: "inherit",
  fontWeight: 800,
  fontSize: "calc(100cqi / var(--n) * 0.6)",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
  color: INK,
  cursor: "pointer",
  aspectRatio: "1",
  minWidth: 0,
  minHeight: 0,
  transition: "background-color 120ms ease",
});

/** Every other box is tinted, so the boxes read at a glance. */
const shadedStyle = css({ background: "#f1ecff" });

/** The selected cell's row, column and box. */
const peerStyle = css({ background: "#dcefff" });

/** Every cell holding the selected cell's digit. */
const sameStyle = css({ background: "#ffd9a8" });

const selectedStyle = css({
  background: "#ffd400",
  boxShadow: "inset 0 0 0 3px hsl(calc(var(--fx-hue, 330) * 1deg) 100% 50%)",
});

const badStyle = css({
  background: "#ffb3c1",
  animation: "fx-wobble 400ms ease",
});

const givenStyle = css({ color: INK });

const playerStyle = css({
  display: "inline-block",
  color: "#3048ff",
  animation: "fx-pop 420ms cubic-bezier(.2,.8,.3,1.4)",
});

const wrongDigitStyle = css({
  display: "inline-block",
  color: "#ff0033",
  animation: "fx-pop 200ms ease-out",
});

const notesStyle = css({
  display: "grid",
  width: "92%",
  height: "92%",
  placeItems: "center",
  fontSize: "calc(100cqi / var(--n) * 0.24)",
  fontWeight: 700,
  color: "#5a5a7a",
});

/** After a game over the board goes grey and stops taking input. */
const deadStyle = css({
  filter: "grayscale(0.85) brightness(0.7)",
  pointerEvents: "none",
  transition: "filter 900ms ease",
});

const padStyle = css({
  display: "grid",
  width: "min(100%, 34rem)",
  gap: "0.3rem",
});

const padButtonStyle = css({
  font: "inherit",
  fontWeight: 900,
  fontSize: "clamp(1.2rem, 6vw, 1.8rem)",
  lineHeight: 1,
  cursor: "pointer",
  padding: "0.45rem 0 0.3rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.15rem",
  borderRadius: radius.md,
  border: `3px solid ${INK}`,
  background: "linear-gradient(180deg, #ffffff, #ffe9a8)",
  color: INK,
  boxShadow: `0 4px 0 ${INK}`,
  touchAction: "manipulation",
  transition: "transform 60ms ease",
  "&:active:not(:disabled)": {
    transform: "translateY(3px)",
    boxShadow: `0 1px 0 ${INK}`,
  },
  "&:disabled": { opacity: 0.25, cursor: "default" },
});

const padNoteStyle = css({
  background: "linear-gradient(180deg, #ffffff, #d7ecff)",
  fontStyle: "italic",
  fontWeight: 600,
});

const padRestStyle = css({
  fontSize: "0.6rem",
  fontWeight: 700,
  opacity: 0.6,
});

const livesStyle = css({
  display: "flex",
  gap: "0.15rem",
  fontSize: "1.4rem",
  lineHeight: 1,
});

const heartStyle = css({
  display: "inline-block",
  color: "#ff2d55",
  textShadow: "0 0 8px #ff2d5588",
  animation: "fx-throb 1.2s ease-in-out infinite",
});

const heartLostStyle = css({
  display: "inline-block",
  opacity: 0.6,
  animation: "fx-pop 450ms cubic-bezier(.2,.8,.3,1.4)",
});

const overTitleStyle = css({
  margin: 0,
  fontSize: "clamp(2rem, 9vw, 3.4rem)",
  fontWeight: 900,
  color: "#ff2d55",
  textShadow: "0 4px 0 #1a1a2e, 0 0 24px #ff003388",
  letterSpacing: "0.06em",
});

const toolsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.5rem",
});

const toolStyle = css({
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
  padding: "0.45rem 0.9rem",
  borderRadius: "999px",
  border: `3px solid ${INK}`,
  background: color.bg,
  color: color.fg,
  boxShadow: `0 4px 0 ${INK}`,
  transition: "transform 80ms ease",
  "&:active:not(:disabled)": {
    transform: "translateY(3px)",
    boxShadow: `0 1px 0 ${INK}`,
  },
  "&:disabled": { opacity: 0.4, cursor: "default" },
});

const toolOnStyle = css({
  background: "#ffd400",
  color: INK,
});

const endStyle = css({
  textAlign: "center",
  animation: "fx-zoom-in 700ms cubic-bezier(.2,.8,.3,1.2)",
});

const clearTitleStyle = css({
  margin: 0,
  fontSize: "clamp(1.8rem, 8vw, 3rem)",
  fontWeight: 900,
  color: "transparent",
  backgroundImage:
    "linear-gradient(90deg, #ff3b6b, #ff8a00, #ffd400, #3ddc84, #00c2ff, #6c5cff, #ff4fd8, #ff3b6b)",
  backgroundSize: "200% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  animation: "fx-slide 1s linear infinite",
});

const endTimeStyle = css({
  margin: "0.2rem 0 0.8rem",
  fontWeight: 800,
  fontFamily: "var(--font-mono)",
});

const bigButtonStyle = css({
  font: "inherit",
  fontSize: "1.3rem",
  fontWeight: 900,
  cursor: "pointer",
  padding: "0.7rem 1.6rem",
  borderRadius: "999px",
  border: `4px solid ${INK}`,
  background: "linear-gradient(135deg, #ffd400, #ff8a00 50%, #ff3b6b)",
  color: INK,
  boxShadow: "0 6px 0 #1a1a2e, 0 0 30px #ff4fd8aa",
  animation: "fx-throb 0.8s ease-in-out infinite",
  "&:active": { transform: "translateY(4px)", boxShadow: "0 2px 0 #1a1a2e" },
});

const hintStyle = css({
  margin: 0,
  color: color.muted,
  fontSize: "0.85rem",
  textAlign: "center",
});
