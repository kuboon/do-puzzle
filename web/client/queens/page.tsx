/**
 * The ドパクイーン page: the board, then the rules.
 *
 * The rules are `server/queens/rules.md`, rendered on the server and handed in as nodes — every
 * game keeps its explanation in one Markdown file next to its server half.
 */

import { css, type Handle, type RemixNode } from "@remix-run/component";

import { SITE_NAME } from "../_shared/layout.tsx";
import { cardStyle, proseStyle } from "../_shared/theme.ts";
import { QueensGame } from "./game.tsx";

export const title = `ドパクイーン — ${SITE_NAME}`;
export const description =
  "各行・各列・各色の領域に 1 つずつ、互いに隣り合わないように女王を置くパズル。";

/** The board is an island. */
export const hydrate = true;

export interface QueensPageProps {
  /** The rules, rendered from Markdown by the server. */
  rules: RemixNode;
}

export default function QueensPage(handle: Handle<QueensPageProps>) {
  return () => (
    <>
      <h1 mix={titleStyle}>ドパクイーン</h1>
      <QueensGame stage={1} />
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
