/**
 * ドパクイーン — the playable board, as an island.
 *
 * The server renders stage 1 (or whatever stage it is handed) so the board is there before any
 * script runs; once hydrated, the island switches to the stage in `?stage=` or the one the player
 * was last on, kept in `localStorage`.
 *
 * Input:
 *
 * - **Tap** toggles × (a note to self: "no queen here").
 * - **Double-tap** or **long-press** places ♛. A queen is judged on the spot: the right cell keeps
 *   it; the wrong one costs a ❤ and turns into ×. A miss with no ❤ left is game over.
 * - **Drag** from an empty cell paints ×; from a × cell, erases them.
 *
 * Everything the player does goes through {@link react}, which works out the board's heat — how
 * many queens are down — and fires effects scaled by it. The last queen before the
 * clear is the loudest move in the game; the clear itself is louder still. See
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
import { createMusic, type Music, musicLevel } from "../_shared/music.ts";
import { color, radius } from "../_shared/tokens.ts";
import {
  attacked,
  isSolved,
  judgeQueen,
  type Mark,
  MAX_LIVES,
  progress,
  type Puzzle,
  puzzleForStage,
} from "./logic.ts";
import { song } from "./song.ts";

export interface QueensProps {
  stage: number;
  [key: string]: SerializableValue;
}

/** How thick a region line is, on each side of it. */
const THICK = "3px";

/**
 * Square caps for this cell's corners, as a CSS background list.
 *
 * Each cell draws only its own edges, so where a thick line turns a corner the outside of the turn
 * belongs to a cell whose two edges there are both thin — and it is left as a notch. That cell
 * paints a THICK×THICK square in the corner to close it.
 */
function corners(
  regions: readonly number[],
  size: number,
  r: number,
  c: number,
): string {
  const at = (rr: number, cc: number) =>
    rr < 0 || cc < 0 || rr >= size || cc >= size ? -1 : regions[rr * size + cc];
  const differ = (a: number, b: number) => a !== -1 && b !== -1 && a !== b;
  const self = at(r, c);
  const caps: string[] = [];
  for (
    const [dr, dc, pos] of [
      [-1, -1, "left top"],
      [-1, 1, "right top"],
      [1, -1, "left bottom"],
      [1, 1, "right bottom"],
    ] as const
  ) {
    const vertical = at(r, c + dc); // beside, across this cell's side edge
    const horizontal = at(r + dr, c); // above/below, across this cell's top/bottom edge
    const diagonal = at(r + dr, c + dc);
    const ownThick = differ(self, vertical) || differ(self, horizontal);
    const otherThick = differ(vertical, diagonal) ||
      differ(horizontal, diagonal);
    if (!ownThick && otherThick) {
      caps.push(
        `linear-gradient(#1a1a2e, #1a1a2e) ${pos} / ${THICK} ${THICK} no-repeat`,
      );
    }
  }
  return caps.length ? caps.join(", ") : "none";
}

/** One colour per region. Bright, and distinct from each other in both themes. */
export const REGION_COLORS = [
  "#ffb26b",
  "#8fd3ff",
  "#b8f28c",
  "#d7b8ff",
  "#ffe066",
  "#ff9aa2",
  "#9fb4ff",
  "#e0b48a",
  "#8ff0cf",
  "#ffb3e1",
] as const;

/** What the pop-up says for the n-th rule-abiding queen. Escalates. */
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

/** A second tap on the same cell within this long is a double-tap. */
const DOUBLE_TAP_MS = 320;
/** Holding a cell this long places a queen. */
const LONG_PRESS_MS = 420;

const STORE_STAGE = "queens:stage";
const STORE_BEST = "queens:best";
const STORE_SOUND = "queens:sound";
const STORE_BGM = "queens:bgm";
const STORE_AUTO = "queens:auto-cross";

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

export const QueensGame = clientEntry(
  import.meta.url,
  function QueensGame(handle: Handle<QueensProps>) {
    let stage = handle.props.stage;
    let puzzle: Puzzle = puzzleForStage(stage);
    let marks: Mark[] = [];
    let history: Mark[][] = [];
    let cleared = false;
    let over = false;
    let lives = MAX_LIVES;
    let best = 0;
    let soundOn = true;
    let bgmOn = true;
    let music: Music | null = null;
    let autoCross = false;
    let startedAt = 0;
    let finishedIn = 0;
    let combo = 0;
    let lastPlaced = 0;
    let fx: Fx | null = null;
    let board: HTMLElement | null = null;
    let clock: HTMLElement | null = null;

    function reset(next: number): void {
      stage = next;
      puzzle = puzzleForStage(stage);
      marks = new Array<Mark>(puzzle.size * puzzle.size).fill("empty");
      history = [];
      cleared = false;
      over = false;
      lives = MAX_LIVES;
      startedAt = 0;
      finishedIn = 0;
      combo = 0;
      setHeat(0);
    }

    /** Feeds the board's heat to the effects and the music. */
    function setHeat(heat: number): void {
      fx?.setHeat(heat);
      music?.setLevel(
        musicLevel(
          Math.round(heat * puzzle.size),
          puzzle.size,
          song.hype.length,
        ),
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
      history.push([...marks]);
      if (history.length > 200) history.shift();
    }

    /** Effects for one change, scaled by how close the board is to done. */
    function react(cell: number, next: Mark): void {
      if (!fx || !board) return;
      const heat = progress(puzzle, marks);
      setHeat(heat);
      const { x, y } = centre(cell);
      const tint = REGION_COLORS[puzzle.regions[cell] % REGION_COLORS.length];

      if (next === "cross") {
        fx.burst(x, y, {
          count: 6 + 14 * heat,
          colors: [tint, "#ffffff"],
          speed: 3 + 3 * heat,
          life: 25,
          size: 2.5,
        });
        fx.sound("cross", heat);
        return;
      }
      if (next === "empty") {
        fx.burst(x, y, { count: 10, colors: ["#999999"], speed: 3, life: 20 });
        return;
      }

      const good = Math.round(heat * puzzle.size);
      const now = performance.now();
      combo = now - lastPlaced < 3000 ? combo + 1 : 1;
      lastPlaced = now;
      const h2 = heat * heat;

      fx.burst(x, y, {
        count: 30 + 260 * h2,
        colors: heat > 0.5 ? [tint, ...RAINBOW, "#ffffff"] : [tint, "#ffffff"],
        speed: 6 + 16 * heat,
        life: 45 + 50 * heat,
        size: 3 + 4 * heat,
      });
      if (heat > 0.4) {
        fx.burst(x, y, {
          count: 20 + 80 * h2,
          shape: "star",
          speed: 5 + 10 * heat,
          life: 70,
          size: 6 + 6 * heat,
        });
      }
      fx.ring(x, y, tint, 70 + 300 * heat);
      if (heat > 0.6) fx.ring(x, y, "#ffffff", 140 + 500 * h2);
      fx.shake(board, 3 + 18 * h2, 300 + 300 * heat);
      if (heat > 0.7) fx.shake(document.body, 4 + 10 * h2, 400);
      fx.flash(tint, 0.08 + 0.4 * h2, 200 + 200 * heat);
      fx.sound("place", heat, good);

      const oneMore = good === puzzle.size - 1;
      const shout = oneMore
        ? "ONE MORE!!"
        : SHOUTS[Math.min(good - 1, SHOUTS.length - 1)];
      if (!isSolved(puzzle, marks)) {
        fx.popText(x, y - 30, shout, {
          size: 26 + 46 * heat,
          color: tint,
          rainbow: heat > 0.6,
          ms: 800 + 600 * heat,
        });
        if (combo >= 3) {
          fx.popText(x, y + 30, `COMBO ×${combo}`, {
            size: 20 + 6 * combo,
            color: "#ffd400",
            rainbow: combo >= 5,
          });
        }
      }

      if (autoCross) {
        for (const c of attacked(puzzle, cell)) {
          if (marks[c] === "empty") marks[c] = "cross";
        }
      }

      if (isSolved(puzzle, marks)) win();
    }

    function win(): void {
      cleared = true;
      music?.fanfare();
      finishedIn = performance.now() - startedAt;
      best = Math.max(best, stage);
      save(STORE_BEST, String(best));
      save(STORE_STAGE, String(stage + 1));
      if (fx && board) {
        const target = board;
        const local = fx;
        void local.celebrate(target, 1 + Math.min(stage, 20) * 0.05);
        // Every queen goes off, one after the other.
        marks.forEach((m, i) => {
          if (m !== "queen") return;
          const row = Math.floor(i / puzzle.size);
          setTimeout(() => {
            const { x, y } = centre(i);
            local.burst(x, y, {
              count: 80,
              shape: "star",
              speed: 12,
              life: 90,
              size: 8,
            });
            local.ring(x, y, RAINBOW[row % RAINBOW.length], 200);
            local.sound("place", 1, row + 3);
          }, 250 + row * 110);
        });
        setTimeout(() => {
          const r = target.getBoundingClientRect();
          local.popText(
            r.left + r.width / 2,
            r.top + r.height / 2,
            "STAGE CLEAR!!",
            {
              size: Math.min(72, r.width / 6),
              rainbow: true,
              ms: 2200,
            },
          );
        }, 300);
      }
      void handle.update();
    }

    /** A wrong queen: a heart breaks, and the cell becomes ×. */
    function miss(cell: number): void {
      combo = 0;
      marks[cell] = "cross";
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

    function gameOver(): void {
      over = true;
      finishedIn = performance.now() - startedAt;
      combo = 0;
      music?.stop();
      fx?.setHeat(0);
      if (fx && board) void fx.defeat(board);
    }

    /** Double-tap or long-press: put a queen down, and find out at once. */
    function placeQueen(cell: number): void {
      if (cleared || over || marks[cell] === "queen") return;
      if (startedAt === 0) startedAt = performance.now();
      snapshot();
      const verdict = judgeQueen(puzzle, cell, lives);
      if (verdict.kind === "queen") {
        apply(cell, "queen");
        return;
      }
      if (verdict.kind === "miss") {
        lives = verdict.lives;
        miss(cell);
      } else gameOver();
      void handle.update();
    }

    /** One user change to one cell. */
    function apply(cell: number, next: Mark): void {
      if (cleared || over || marks[cell] === next) return;
      if (startedAt === 0) startedAt = performance.now();
      marks[cell] = next;
      react(cell, next);
      void handle.update();
    }

    let lastTap = { cell: -1, at: 0, toggled: false };

    /** A tap toggles ×; a second tap on the same cell straight after is a double-tap. */
    function tap(cell: number): void {
      const now = performance.now();
      if (lastTap.cell === cell && now - lastTap.at < DOUBLE_TAP_MS) {
        // The first tap of the pair toggled ×; take that back before the queen goes down.
        const prev = lastTap.toggled ? history.pop() : undefined;
        if (prev) marks = prev;
        lastTap = { cell: -1, at: 0, toggled: false };
        placeQueen(cell);
        return;
      }
      const current = marks[cell];
      lastTap = { cell, at: now, toggled: current !== "queen" };
      if (current === "queen") return;
      snapshot();
      apply(cell, current === "cross" ? "empty" : "cross");
    }

    function undo(): void {
      const prev = history.pop();
      if (!prev || cleared || over) return;
      marks = prev;
      setHeat(progress(puzzle, marks));
      fx?.sound("tick");
      void handle.update();
    }

    /** Clears every ×. Queens stay: each one on the board is already known to be right. */
    function clearCrosses(): void {
      if (cleared || over) return;
      snapshot();
      marks = marks.map((m) => (m === "cross" ? "empty" : m));
      if (board) fx?.shake(board, 8);
      void handle.update();
    }

    function retry(): void {
      reset(stage);
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

    function toggleAuto(): void {
      autoCross = !autoCross;
      save(STORE_AUTO, autoCross ? "on" : "off");
      void handle.update();
    }

    // --- pointer: tap, double-tap, long-press, drag ---------------------------

    let downCell = -1;
    /** What a drag paints: × from an empty cell, empty from a × cell, nothing from a queen. */
    let paint: Mark | null = null;
    let dragged = false;
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pressFired = false;
    /** The cell being held, for the charge-up ring. */
    let pressing = -1;

    function cellAt(x: number, y: number): number {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(
        "[data-cell]",
      );
      return el ? Number(el.dataset.cell) : -1;
    }

    function setPressing(cell: number): void {
      if (pressing === cell) return;
      pressing = cell;
      void handle.update();
    }

    function onDown(event: PointerEvent): void {
      if (cleared || over || event.button > 0) return;
      const cell = cellAt(event.clientX, event.clientY);
      if (cell < 0) return;
      event.preventDefault();
      downCell = cell;
      dragged = false;
      pressFired = false;
      paint = marks[cell] === "empty"
        ? "cross"
        : marks[cell] === "cross"
        ? "empty"
        : null;
      clearTimeout(pressTimer);
      if (marks[cell] !== "queen") {
        setPressing(cell);
        pressTimer = setTimeout(() => {
          if (downCell !== cell || dragged) return;
          pressFired = true;
          lastTap = { cell: -1, at: 0, toggled: false };
          setPressing(-1);
          placeQueen(cell);
        }, LONG_PRESS_MS);
      }
    }

    function onMove(event: PointerEvent): void {
      if (downCell < 0 || pressFired) return;
      const cell = cellAt(event.clientX, event.clientY);
      if (cell < 0 || (cell === downCell && !dragged)) return;
      clearTimeout(pressTimer);
      setPressing(-1);
      if (paint === null) return;
      if (!dragged) {
        dragged = true;
        snapshot();
        apply(downCell, paint);
      }
      if (marks[cell] !== "queen") apply(cell, paint);
    }

    function onUp(): void {
      clearTimeout(pressTimer);
      if (downCell >= 0 && !dragged && !pressFired) tap(downCell);
      downCell = -1;
      paint = null;
      dragged = false;
      pressFired = false;
      setPressing(-1);
    }

    handle.queueTask(() => {
      const params = new URL(location.href).searchParams;
      best = Number(load(STORE_BEST) ?? 0) || 0;
      soundOn = load(STORE_SOUND) !== "off";
      bgmOn = load(STORE_BGM) !== "off";
      autoCross = load(STORE_AUTO) === "on";
      const wanted = Number(params.get("stage") ?? load(STORE_STAGE) ?? 1);
      const start = Number.isInteger(wanted) && wanted >= 1
        ? Math.min(wanted, best + 1)
        : 1;
      if (start !== stage) reset(start);

      fx = createFx();
      fx.setMuted(!soundOn);
      handle.signal.addEventListener("abort", () => fx?.destroy());
      music = createMusic(song);
      music.setMuted(!bgmOn);
      handle.signal.addEventListener("abort", () => music?.destroy());

      globalThis.addEventListener("pointerup", onUp, { signal: handle.signal });
      globalThis.addEventListener("pointercancel", onUp, {
        signal: handle.signal,
      });
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
      handle.signal.addEventListener("abort", () => clearInterval(timer));
      void handle.update();
    });

    return () => {
      const { size, regions } = puzzle;
      const heat = progress(puzzle, marks);
      const queens = marks.filter((m) => m === "queen").length;

      return (
        <section mix={wrapStyle} aria-label="ドパクイーン">
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
            {Array.from({ length: size }, (_, i) => (
              <span
                key={`${i}-${i < Math.round(heat * size)}`}
                mix={i < Math.round(heat * size) ? pipOnStyle : pipStyle}
              >
                ♛
              </span>
            ))}
          </div>

          <div
            role="grid"
            aria-label={`${size}×${size} の盤面`}
            mix={[
              ref((node) => (board = node as HTMLElement)),
              boardStyle,
              heat >= 0.75 ? hotStyle : null,
              over ? deadStyle : null,
              on<HTMLDivElement, "pointerdown">("pointerdown", onDown),
              on<HTMLDivElement, "pointermove">("pointermove", onMove),
              on("contextmenu", (e) => e.preventDefault()),
            ]}
            style={{
              gridTemplateColumns: `repeat(${size}, 1fr)`,
              "--n": String(size),
              "--board-heat": String(heat),
            }}
          >
            {marks.map((mark, i) => {
              const r = Math.floor(i / size);
              const c = i % size;
              const region = regions[i];
              const edge = (other: number | undefined) =>
                other === undefined || other !== region ? THICK : "0.5px";
              return (
                <button
                  key={`${stage}-${i}`}
                  type="button"
                  role="gridcell"
                  data-cell={String(i)}
                  aria-label={`${r + 1}行${c + 1}列 ${
                    mark === "queen"
                      ? "クイーン"
                      : mark === "cross"
                      ? "×"
                      : "空"
                  }`}
                  mix={[cellStyle, pressing === i ? pressStyle : null]}
                  style={{
                    background: REGION_COLORS[region % REGION_COLORS.length],
                    "--bt": edge(r > 0 ? regions[i - size] : undefined),
                    "--bb": edge(r < size - 1 ? regions[i + size] : undefined),
                    "--bl": edge(c > 0 ? regions[i - 1] : undefined),
                    "--br": edge(c < size - 1 ? regions[i + 1] : undefined),
                    "--corners": corners(regions, size, r, c),
                  }}
                >
                  {mark === "queen"
                    ? queenMark()
                    : mark === "cross"
                    ? crossMark()
                    : null}
                </button>
              );
            })}
          </div>

          {over
            ? (
              <div mix={clearStyle} role="status">
                <p mix={overTitleStyle}>GAME OVER</p>
                <p mix={clearTimeStyle}>STAGE {stage}</p>
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
              <div mix={clearStyle} role="status">
                <p mix={clearTitleStyle}>STAGE {stage} CLEAR!!</p>
                <p mix={clearTimeStyle}>TIME {formatTime(finishedIn)}</p>
                <button
                  type="button"
                  mix={[bigButtonStyle, on("click", () => goTo(stage + 1))]}
                >
                  NEXT STAGE ▶
                </button>
              </div>
            )
            : (
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
                  mix={[toolStyle, on("click", clearCrosses)]}
                  disabled={!marks.includes("cross")}
                >
                  ✕ を消す
                </button>
                <button
                  type="button"
                  aria-pressed={autoCross ? "true" : "false"}
                  mix={[
                    toolStyle,
                    autoCross ? toolOnStyle : null,
                    on("click", toggleAuto),
                  ]}
                >
                  自動 ✕
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
            )}
          <p mix={hintStyle}>
            {queens}/{size}{" "}
            ♛ — タップで ✕、ダブルタップか長押しで ♛（外すと ❤
            が減る）。ドラッグで ✕ をまとめて付け外し
          </p>
        </section>
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

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
  display: "flex",
  gap: "0.3rem",
  fontSize: "1.3rem",
  lineHeight: 1,
});

const pipStyle = css({ opacity: 0.18 });

const pipOnStyle = css({
  display: "inline-block",
  color: "hsl(calc(var(--fx-hue, 330) * 1deg) 95% 55%)",
  textShadow: "0 0 10px currentColor",
  animation: "fx-pop 450ms cubic-bezier(.2,.8,.3,1.4)",
});

const boardStyle = css({
  display: "grid",
  width: "min(100%, 34rem)",
  aspectRatio: "1",
  // The cells size their marks off the board's width: `100cqi / --n` is one cell.
  containerType: "inline-size",
  border: "4px solid #1a1a2e",
  borderRadius: radius.md,
  overflow: "hidden",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
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
  // Region lines go on an overlay rather than the cell's own border: uneven borders would push
  // the cell's content box, and the mark with it, off-centre.
  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderStyle: "solid",
    borderColor: "#1a1a2e",
    borderWidth: "var(--bt) var(--br) var(--bb) var(--bl)",
    pointerEvents: "none",
  },
  // The corner caps from `corners()`: where a thick line turns at this cell's corner but neither
  // of this cell's own edges there is thick, nothing else paints that little square.
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    background: "var(--corners, none)",
    pointerEvents: "none",
  },
  font: "inherit",
  color: "#1a1a2e",
  cursor: "pointer",
  aspectRatio: "1",
  minWidth: 0,
  transition: "filter 80ms ease",
  "&:hover": { filter: "brightness(1.12) saturate(1.2)" },
});

/** The held cell charges up until the long-press lands. */
const pressStyle = css({
  boxShadow: "inset 0 0 0 0 #ffffffcc",
  animation: `fx-charge ${LONG_PRESS_MS}ms linear forwards`,
});

/** After a game over the board goes grey and stops taking input. */
const deadStyle = css({
  filter: "grayscale(0.85) brightness(0.7)",
  pointerEvents: "none",
  transition: "filter 900ms ease",
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

/**
 * The marks are drawn, not typed. A ♛ glyph sits wherever its font puts it — off to one side and
 * below the middle, by a different amount in every font — so each mark is an SVG drawn centred in
 * its own square, and the square fills most of the cell.
 */
function queenMark() {
  return (
    <svg key="q" viewBox="0 0 100 100" aria-hidden="true" mix={queenStyle}>
      <path
        d="M14 34 L26 60 L32 26 L42 58 L50 18 L58 58 L68 26 L74 60 L86 34 L78 76 L22 76 Z"
        fill="#1a1a2e"
        stroke="#1a1a2e"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <circle cx="14" cy="32" r="6" fill="#1a1a2e" />
      <circle cx="32" cy="24" r="6" fill="#1a1a2e" />
      <circle cx="50" cy="15" r="6.5" fill="#1a1a2e" />
      <circle cx="68" cy="24" r="6" fill="#1a1a2e" />
      <circle cx="86" cy="32" r="6" fill="#1a1a2e" />
      <rect x="21" y="80" width="58" height="10" rx="3" fill="#1a1a2e" />
      <path
        d="M28 66 H72"
        stroke="#ffffff"
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

function crossMark() {
  return (
    <svg key="x" viewBox="0 0 100 100" aria-hidden="true" mix={crossStyle}>
      <path
        d="M24 24 L76 76 M76 24 L24 76"
        stroke="#1a1a2e"
        stroke-width="13"
        stroke-linecap="round"
      />
    </svg>
  );
}

const queenStyle = css({
  display: "block",
  width: "82%",
  height: "82%",
  filter: "drop-shadow(0 0 3px #fff) drop-shadow(0 1px 0 #fff)",
  animation: "fx-pop 420ms cubic-bezier(.2,.8,.3,1.4)",
});

const crossStyle = css({
  display: "block",
  width: "62%",
  height: "62%",
  opacity: 0.6,
  animation: "fx-pop 200ms ease-out",
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
  border: "3px solid #1a1a2e",
  background: color.bg,
  color: color.fg,
  boxShadow: "0 4px 0 #1a1a2e",
  transition: "transform 80ms ease",
  "&:active:not(:disabled)": {
    transform: "translateY(3px)",
    boxShadow: "0 1px 0 #1a1a2e",
  },
  "&:disabled": { opacity: 0.4, cursor: "default" },
});

const toolOnStyle = css({
  background: "#ffd400",
  color: "#1a1a2e",
});

const clearStyle = css({
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

const clearTimeStyle = css({
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
  border: "4px solid #1a1a2e",
  background: "linear-gradient(135deg, #ffd400, #ff8a00 50%, #ff3b6b)",
  color: "#1a1a2e",
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
