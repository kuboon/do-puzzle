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
    name: "QUEENS",
    tagline: "各行・各列・各色に 1 つずつ。隣り合わないように女王を置け。",
    icon: "♛",
    href: routes.queens.href(),
  },
];
