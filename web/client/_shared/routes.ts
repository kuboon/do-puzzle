/**
 * Every URL the app answers, in one place.
 *
 * `server/router.tsx` maps these to what answers them, and everything that links reads
 * `routes.queens.href()` rather than rebuilding `${base}/queens` at each call site. The map is
 * built with the deploy prefix as its base, so hrefs are right under a GitHub Pages sub-path or a
 * PR preview without anyone prepending anything.
 *
 * One route per game, named after the game's directory (`client/<game>/`, `server/<game>/`).
 */

import { get, route } from "@remix-run/fetch-router/routes";

import { base } from "./base.ts";

export const routes = route(base, {
  home: get("/"),
  queens: get("/queens"),
});
