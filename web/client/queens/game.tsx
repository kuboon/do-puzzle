/**
 * QUEENS — the playable board, as an island.
 *
 * The server renders stage 1 (or whatever stage it is handed) so the board is there before any
 * script runs; once hydrated, the island switches to the stage in `?stage=` or the one the player
 * was last on, kept in `localStorage`.
 *
 * Input, as in the well-known version of this puzzle:
 *
 * - **Tap** a cell to cycle it: empty → × → ♛ → empty.
 * - **Drag** from an empty cell to paint × across every empty cell the pointer passes.
 *
 * Everything the player does goes through {@link react}, which works out the board's heat — how
 * many rule-abiding queens are down — and fires effects scaled by it. The last queen before the
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
import { color, radius } from "../_shared/tokens.ts";
import {
  attacked,
  conflicts,
  isSolved,
  type Mark,
  progress,
  type Puzzle,
  puzzleForStage,
} from "./logic.ts";

export interface QueensProps {
  stage: number;
  [key: string]: SerializableValue;
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

const STORE_STAGE = "queens:stage";
const STORE_BEST = "queens:best";
const STORE_SOUND = "queens:sound";
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
    let best = 0;
    let soundOn = true;
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
      startedAt = 0;
      finishedIn = 0;
      combo = 0;
      fx?.setHeat(0);
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
      fx.setHeat(heat);
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

      const bad = conflicts(puzzle, marks);
      if (bad.has(cell)) {
        combo = 0;
        fx.sound("error");
        fx.shake(board, 16, 400);
        fx.flash("#ff0033", 0.3, 300);
        for (const c of bad) {
          const p = centre(c);
          fx.burst(p.x, p.y, {
            count: 30,
            colors: ["#ff0033", "#ff8a00", "#330000"],
            speed: 7,
            life: 35,
          });
        }
        fx.popText(x, y - 20, "✖ NG", { color: "#ff3355", size: 40 });
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

    /** One user change to one cell. */
    function apply(cell: number, next: Mark): void {
      if (cleared || marks[cell] === next) return;
      if (startedAt === 0) startedAt = performance.now();
      marks[cell] = next;
      react(cell, next);
      void handle.update();
    }

    function cycle(cell: number): void {
      const current = marks[cell];
      const next: Mark = current === "empty"
        ? "cross"
        : current === "cross"
        ? "queen"
        : "empty";
      snapshot();
      apply(cell, next);
    }

    function undo(): void {
      const prev = history.pop();
      if (!prev || cleared) return;
      marks = prev;
      fx?.setHeat(progress(puzzle, marks));
      fx?.sound("tick");
      void handle.update();
    }

    function clearBoard(): void {
      if (cleared) return;
      snapshot();
      marks = marks.map(() => "empty");
      fx?.setHeat(0);
      if (board) fx?.shake(board, 8);
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

    // --- pointer: tap to cycle, drag to paint crosses ------------------------

    let downCell = -1;
    let painting = false;
    let dragged = false;

    function cellAt(x: number, y: number): number {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(
        "[data-cell]",
      );
      return el ? Number(el.dataset.cell) : -1;
    }

    function onDown(event: PointerEvent): void {
      if (cleared || event.button > 0) return;
      const cell = cellAt(event.clientX, event.clientY);
      if (cell < 0) return;
      event.preventDefault();
      downCell = cell;
      painting = marks[cell] === "empty";
      dragged = false;
    }

    function onMove(event: PointerEvent): void {
      if (downCell < 0 || !painting) return;
      const cell = cellAt(event.clientX, event.clientY);
      if (cell < 0 || (cell === downCell && !dragged)) return;
      if (!dragged) {
        dragged = true;
        snapshot();
        apply(downCell, "cross");
      }
      if (marks[cell] === "empty") apply(cell, "cross");
    }

    function onUp(): void {
      if (downCell >= 0 && !dragged) cycle(downCell);
      downCell = -1;
      painting = false;
      dragged = false;
    }

    handle.queueTask(() => {
      const params = new URL(location.href).searchParams;
      best = Number(load(STORE_BEST) ?? 0) || 0;
      soundOn = load(STORE_SOUND) !== "off";
      autoCross = load(STORE_AUTO) === "on";
      const wanted = Number(params.get("stage") ?? load(STORE_STAGE) ?? 1);
      const start = Number.isInteger(wanted) && wanted >= 1
        ? Math.min(wanted, best + 1)
        : 1;
      if (start !== stage) reset(start);

      fx = createFx();
      fx.setMuted(!soundOn);
      handle.signal.addEventListener("abort", () => fx?.destroy());

      globalThis.addEventListener("pointerup", onUp, { signal: handle.signal });
      globalThis.addEventListener("pointercancel", onUp, {
        signal: handle.signal,
      });
      const timer = setInterval(() => {
        if (!clock) return;
        clock.textContent = formatTime(
          cleared ? finishedIn : startedAt ? performance.now() - startedAt : 0,
        );
      }, 250);
      handle.signal.addEventListener("abort", () => clearInterval(timer));
      void handle.update();
    });

    return () => {
      const { size, regions } = puzzle;
      const bad = conflicts(puzzle, marks);
      const heat = progress(puzzle, marks);
      const queens = marks.filter((m) => m === "queen").length;

      return (
        <section mix={wrapStyle} aria-label="QUEENS">
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
              on<HTMLDivElement, "pointerdown">("pointerdown", onDown),
              on<HTMLDivElement, "pointermove">("pointermove", onMove),
              on("contextmenu", (e) => e.preventDefault()),
            ]}
            style={{
              gridTemplateColumns: `repeat(${size}, 1fr)`,
              "--board-heat": String(heat),
            }}
          >
            {marks.map((mark, i) => {
              const r = Math.floor(i / size);
              const c = i % size;
              const region = regions[i];
              const edge = (other: number | undefined) =>
                other === undefined || other !== region ? "3px" : "0.5px";
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
                  mix={[cellStyle, bad.has(i) ? badStyle : null]}
                  style={{
                    background: REGION_COLORS[region % REGION_COLORS.length],
                    borderTopWidth: edge(r > 0 ? regions[i - size] : undefined),
                    borderBottomWidth: edge(
                      r < size - 1 ? regions[i + size] : undefined,
                    ),
                    borderLeftWidth: edge(c > 0 ? regions[i - 1] : undefined),
                    borderRightWidth: edge(
                      c < size - 1 ? regions[i + 1] : undefined,
                    ),
                  }}
                >
                  {mark === "queen"
                    ? <span key="q" mix={queenStyle}>♛</span>
                    : mark === "cross"
                    ? <span key="x" mix={crossStyle}>×</span>
                    : null}
                </button>
              );
            })}
          </div>

          {cleared
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
                  mix={[toolStyle, on("click", clearBoard)]}
                  disabled={!marks.some((m) => m !== "empty")}
                >
                  ⟲ リセット
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
                  自動 ×
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
              </div>
            )}
          <p mix={hintStyle}>
            {queens}/{size} ♛ — タップで × → ♛ → 空、ドラッグで × を連続配置
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
  border: "0 solid #1a1a2e",
  font: "inherit",
  color: "#1a1a2e",
  cursor: "pointer",
  aspectRatio: "1",
  minWidth: 0,
  transition: "filter 80ms ease",
  "&:hover": { filter: "brightness(1.12) saturate(1.2)" },
});

const badStyle = css({
  backgroundImage:
    "repeating-linear-gradient(45deg, #ff003366 0 6px, transparent 6px 12px) !important",
  animation: "fx-wobble 0.3s ease-in-out 2",
});

const queenStyle = css({
  display: "inline-block",
  fontSize: "clamp(1rem, 6vw, 2.2rem)",
  lineHeight: 1,
  textShadow: "0 0 8px #fff, 0 2px 0 #fff8",
  animation: "fx-pop 420ms cubic-bezier(.2,.8,.3,1.4)",
});

const crossStyle = css({
  display: "inline-block",
  fontSize: "clamp(0.8rem, 4vw, 1.4rem)",
  fontWeight: 900,
  lineHeight: 1,
  opacity: 0.55,
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
