/**
 * ドパクイーン, server half: the page, with `rules.md` beside this file rendered into it.
 */

import { ogImage } from "../_shared/og/mod.ts";
import { renderMarkdownFile } from "../_shared/markdown.ts";
import { clientRuntime } from "../_shared/runtime.ts";
import { Layout } from "../../client/_shared/layout.tsx";
import { routes } from "../../client/_shared/routes.ts";
import * as Page from "../../client/queens/page.tsx";
import type { AppContext } from "../router.tsx";

const image = ogImage(routes.queens.href(), {
  title: "ドパクイーン",
  description: Page.description,
});

export async function queensAction(context: AppContext): Promise<Response> {
  const rules = await renderMarkdownFile(
    new URL("./rules.md", import.meta.url),
  );
  return context.render(
    <Layout
      title={Page.title}
      description={Page.description}
      image={image}
      viewport={Page.viewport}
      script={Page.hydrate ? clientRuntime : null}
    >
      <Page.default rules={rules} />
    </Layout>,
  );
}
