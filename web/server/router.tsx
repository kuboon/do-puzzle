/**
 * The app, wired by hand. The only entry point.
 *
 * Route definitions live in `client/_shared/routes.ts`; this file maps them to what answers them.
 * There is no server at runtime: the export is a plain `@remix-run/fetch-router` router, and
 * `deno task build` (`@remix-kbn/ssg`) crawls it with `fetch()` from `entryPoints`, writing every
 * response to `web/dist` for GitHub Pages. `deno task dev` serves the same router live.
 */

import {
  createController,
  createRouter,
  type RouterContext,
} from "@remix-run/fetch-router";
import { render } from "@remix-run/render-middleware";
import { createFileTree, githubPages } from "@remix-kbn/ssg/site";
import type { FileServerBehavior } from "@remix-kbn/ssg/site";

import { assets, assetsPath } from "./_shared/assets.ts";
import { clientRuntime } from "./_shared/runtime.ts";
import { ogImage, ogPaths, serveOgImage } from "./_shared/og/mod.ts";
import { base } from "../client/_shared/base.ts";
import { Layout } from "../client/_shared/layout.tsx";
import { routes } from "../client/_shared/routes.ts";
import * as Home from "../client/_shared/home.tsx";

import { queensAction } from "./queens/mod.tsx";

/** Deploy path prefix. The build strips it back off when writing, so output lands at the root. */
export { base };

/** Where the static build deploys. The build writes the file this rule would serve. */
export const fileServer: FileServerBehavior = githubPages();

/** The files under `client/_shared/static/`, served verbatim at their own names. */
const staticFiles = await createFileTree({
  rootDir: `${import.meta.dirname}/../client/_shared/static`,
  basePath: `${base}/static`,
  cacheControl: "public, max-age=3600",
});

/** `render({ assets })` puts `context.render(node)` on every request. */
const router = createRouter({ middleware: [render({ assets })] });

/** The request context those middlewares produce — `context.render`, in practice. */
export type AppContext = RouterContext<typeof router>;

declare module "@remix-run/fetch-router" {
  interface RouterTypes {
    context: AppContext;
  }
}

const homeImage = ogImage(routes.home.href(), Home);

const pages = createController(routes, {
  actions: {
    home: (context) =>
      context.render(
        <Layout
          title={Home.title}
          description={Home.description}
          image={homeImage}
          script={Home.hydrate ? clientRuntime : null}
        >
          <Home.default />
        </Layout>,
      ),
    queens: queensAction,
  },
});

router.map(routes, pages);

router.get(`${base}/static/*path`, ({ request }) => staticFiles.fetch(request));
router.get(`${assetsPath}/*path`, ({ request }) => assets.fetch(request));
router.get(`${base}/og/*path`, ({ request }) => serveOgImage(request));

/**
 * Where the static crawl starts. Pages are reached by following links from `/`; the social cards
 * are not linked from anywhere, so they are listed.
 */
export const entryPoints: readonly string[] = ["/", ...ogPaths()];

export default router;
