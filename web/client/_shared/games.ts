/**
 * The games on the site, for the home page and the nav.
 *
 * Adding a game: a directory each under `client/` and `server/` named after it, a route in
 * `routes.ts`, a line in `server/router.tsx`, and an entry here.
 */

import { routes } from "./routes.ts";

export interface GameEntry {
  id: string;
  name: string;
  /** One line for the card on the home page. */
  tagline: string;
  /** A glyph for the card. */
  icon: string;
  href: string;
}

export const games: readonly GameEntry[] = [
  {
    id: "queens",
    name: "ドパクイーン",
    tagline: "各行・各列・各色に 1 つずつ。隣り合わないように女王を置け。",
    icon: "♛",
    href: routes.queens.href(),
  },
  {
    id: "sudoku",
    name: "ドパ数独",
    tagline: "各行・各列・各ブロックに数字を 1 つずつ。埋めるほど爆発する。",
    icon: "9",
    href: routes.sudoku.href(),
  },
];
