# web/tests — ブラウザ smoke

opt-in のブラウザテスト。デフォルトの `deno task test` には含まれず、
`deno task test:browser` で明示的に起動する。lightpanda バイナリは
npm:@lightpanda/browser の postinstall script でビルドされる。

## カバー範囲

- `browser_queens.test.ts` — `/queens` を開き、`globalThis.__rmxReady`
  が立つまで待ってから左上のマスをタップし、× になることを assert する。 SSR →
  island chunk の動的 import → `handle.update()` の経路を通す。
- `browser_sudoku.test.ts` — `/sudoku` を開き、ステージ 1 の最初の空マスを選んで
  正しい数字ボタンを押し、そのマスに数字が入ることを assert する。
- `lightpanda.ts` — 上の 2 つが使う lightpanda
  起動・アプリ起動・ページを開く処理。
