/**
 * The browser modules, compiled as one graph.
 *
 * Every entrypoint below goes into a single `Deno.bundle({ codeSplitting: true })` call, so a
 * module two of them import — the component runtime, the effects engine — is emitted once into a
 * shared chunk.
 *
 * Islands are globbed: a game's island is `client/<game>/game.tsx`, and that is the decision.
 */

import { createAssetServer } from "@remix-kbn/assets-deno";

import { base } from "../../client/_shared/base.ts";

/** The directory every entrypoint below, and every `clientEntry()` id, is resolved against. */
const clientDir = new URL("../../client/", import.meta.url);

/** Where the chunks are served, and where `entryUrl()` resolves against. */
export const assetsPath = `${base}/assets`;

export const assets = await createAssetServer({
  rootDir: decodeURIComponent(clientDir.pathname),
  entrypoints: [
    // The client runtime. Every hydrating page loads this one.
    "_shared/hydration.ts",
    // One island per game.
    "*/game.tsx",
  ],
  basePath: assetsPath,
  mode: "bundle",
  bundle: { sourcemap: "none" },
});
