/**
 * Markdown → `@remix-run/component` nodes, for the rules page each game has.
 *
 * `@kuboon/md` parses GitHub-flavoured Markdown into a sanitized hast tree and `hastToElement`
 * turns it into elements with *our* `createElement`, so there is one copy of the runtime.
 */

import { createElement, type RemixNode } from "@remix-run/component";
import { markdownToHast } from "@kuboon/md";
import { hastToElement } from "@kuboon/md/hast_to_element.ts";

/** Reads a Markdown file and renders it. */
export async function renderMarkdownFile(url: URL): Promise<RemixNode> {
  const text = await Deno.readTextFile(url);
  return hastToElement(await markdownToHast(text), createElement);
}
