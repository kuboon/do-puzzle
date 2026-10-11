import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import router from "./router.tsx";

Deno.test("GET / lists the games and ships no script", async () => {
  const res = await router.fetch(new Request("http://x/"));
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "text/html");
  const html = await res.text();
  assertStringIncludes(html, "<!DOCTYPE html>");
  assertStringIncludes(html, "ドパズル");
  assertStringIncludes(html, 'href="/queens"');
  assert(!html.includes('<script type="module"'));
});

Deno.test("GET /queens renders the board, the rules and the runtime", async () => {
  const res = await router.fetch(new Request("http://x/queens"));
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(
    html,
    '<script type="module" src="/assets/_shared/hydration',
  );
  assertStringIncludes(html, "/assets/queens/game");
  // Stage 1 is 5×5: 25 cells rendered on the server.
  assertEquals(html.match(/data-cell="/g)?.length, 25);
  // The rules come from rules.md.
  assertStringIncludes(html, "クイーンのルール");
});

Deno.test("GET /og/queens.png is a PNG", async () => {
  const res = await router.fetch(new Request("http://x/og/queens.png"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
  await res.body?.cancel();
});
