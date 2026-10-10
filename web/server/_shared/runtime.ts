/**
 * Where the client runtime was compiled to, resolved once.
 *
 * The shell writes one `<script>` — `run()`, which hydrates whatever islands a page placed — and
 * this is the URL it needs, plus the chunks to preload behind it.
 */

import { assets } from "./assets.ts";
import type { ClientRuntime } from "../../client/_shared/layout.tsx";

const entry = await assets.getScriptEntry("_shared/hydration.ts");

/** The `<script type="module">` a hydrating page loads, and the chunks to preload behind it. */
export const clientRuntime: ClientRuntime = {
  src: entry.href,
  preloads: entry.preloads,
};
