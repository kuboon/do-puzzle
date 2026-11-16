import { assertEquals } from "@std/assert";

import { withPage } from "./lightpanda.ts";

Deno.test({
  name: "lightpanda: /queens のマスをタップすると × になる",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await withPage("/queens", async (page) => {
      const label = () =>
        page.$eval('[data-cell="0"]', (el) => el.getAttribute("aria-label"));
      assertEquals(await label(), "1行1列 空");

      // A tap is a pointerdown on the board followed by a pointerup anywhere.
      await page.$eval('[data-cell="0"]', (el) => {
        const r = el.getBoundingClientRect();
        const init = {
          bubbles: true,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
        };
        el.dispatchEvent(new PointerEvent("pointerdown", init));
        globalThis.dispatchEvent(new PointerEvent("pointerup", init));
      });

      await page.waitForFunction(
        () =>
          document.querySelector('[data-cell="0"]')?.getAttribute(
            "aria-label",
          ) === "1行1列 ×",
        { timeout: 5_000 },
      );
    });
  },
});
