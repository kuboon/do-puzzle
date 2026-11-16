/**
 * The ドパ数独 page: the board, then the rules.
 *
 * The rules are `server/sudoku/rules.md`, rendered on the server and handed in as nodes — every
 * game keeps its explanation in one Markdown file next to its server half.
 */

import { css, type Handle, type RemixNode } from "@remix-run/component";

import { SITE_NAME } from "../_shared/layout.tsx";
import { NO_ZOOM_VIEWPORT } from "../_shared/no_zoom.ts";
import { cardStyle, proseStyle } from "../_shared/theme.ts";
import { SudokuGame } from "./game.tsx";

export const title = `ドパ数独 — ${SITE_NAME}`;
export const description =
  "各行・各列・各ブロックに 1〜9 を 1 つずつ。数字を埋めるたびに派手になる数独。";

/** The board is an island. */
export const hydrate = true;

/** A play screen: no zoom. See `_shared/no_zoom.ts`. */
export const viewport = NO_ZOOM_VIEWPORT;

export interface SudokuPageProps {
  /** The rules, rendered from Markdown by the server. */
  rules: RemixNode;
}

export default function SudokuPage(handle: Handle<SudokuPageProps>) {
  return () => (
    <>
      <h1 mix={titleStyle}>ドパ数独</h1>
      <SudokuGame stage={1} />
      <article mix={[cardStyle, proseStyle]}>{handle.props.rules}</article>
    </>
  );
}

const titleStyle = css({
  textAlign: "center",
  fontSize: "clamp(2rem, 9vw, 3.2rem)",
  fontWeight: 900,
  letterSpacing: "0.1em",
  marginBlock: "0.5rem 0",
  color: "transparent",
  backgroundImage:
    "linear-gradient(90deg, #ff3b6b, #ff8a00, #ffd400, #3ddc84, #00c2ff, #6c5cff, #ff4fd8, #ff3b6b)",
  backgroundSize: "200% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  animation: "fx-slide 3s linear infinite",
});
