import { assertEquals } from "@std/assert";

import { puzzleForStage } from "../client/sudoku/logic.ts";
import { withPage } from "./lightpanda.ts";

Deno.test({
  name: "lightpanda: /sudoku で空マスを選んで正しい数字を押すと書き込まれる",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const puzzle = puzzleForStage(1);
    const cell = puzzle.givens.indexOf(0);
    const digit = puzzle.solution[cell];
    const r = Math.floor(cell / puzzle.size) + 1;
    const c = (cell % puzzle.size) + 1;

    await withPage("/sudoku", async (page) => {
      const selector = `[data-cell="${cell}"]`;
      assertEquals(
        await page.$eval(selector, (el) => el.getAttribute("aria-label")),
        `${r}行${c}列 空`,
      );

      await page.$eval(selector, (el) => (el as HTMLElement).click());
      await page.waitForFunction(
        (s: string) =>
          document.querySelector(s)?.getAttribute("aria-selected") === "true",
        { timeout: 5_000 },
        selector,
      );
      await page.$eval(
        `[data-digit="${digit}"]`,
        (el) => (el as HTMLElement).click(),
      );

      await page.waitForFunction(
        (s: string, want: string) =>
          document.querySelector(s)?.getAttribute("aria-label") === want,
        { timeout: 5_000 },
        selector,
        `${r}行${c}列 ${digit}`,
      );
    });
  },
});
