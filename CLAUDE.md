# ドパズル (do-puzzle)

ブラウザで遊べるパズルゲーム集。Remix v3 + Deno
で書き、**サーバ不要**の静的サイト （SSG → GitHub Pages）として配信する。

## 演出ルール（リポジトリ全体）

**演出はめちゃくちゃ派手にする。そしてステージクリアが近づくほど派手さを増す。**
すべてのゲームがこのルールに従う。

- 盤面の「クリアへの近さ」を `0 … 1` の **heat** として計算し、
  `web/client/_shared/fx.ts` の `Fx.setHeat()` に渡す。背景（色の塊・回転する
  色相・湧き上がる火の粉）は heat に応じて勝手に派手になる。
- 1 手ごとの演出（パーティクル・衝撃波リング・画面揺れ・フラッシュ・ポップアップ
  文字・効果音）も heat を掛けて強くする。残り 1 手は最大級、クリアは
  `Fx.celebrate()`（ヒットストップ → ホワイトアウト → 花火・紙吹雪）。
- heat は盤面から見て明らかに正しいものだけで計算する（答えを覗かない — heat
  から正誤がバレないように）。
- **BGM も同じルール**: `web/client/_shared/music.ts`（`jsr:@kuboon/bgm` の上に
  載せた adaptive BGM）。序盤は calm（のんびり）、盤面が半分解けたら hype
  に切り替え、1 つ解けるごとにレイヤー（stem）を重ねて和音を豪華にする。
  `musicLevel()` が進み具合 → レイヤー数を決める。曲は各ゲームの
  `client/<game>/song.ts` に MML で書く（hype の stem は全部同じ小節数・先頭に
  `L`）。クリアで fanfare。
- 新しい演出はゲーム固有にせず、まず `fx.ts`
  に足して全ゲームで使えるようにする。
- `prefers-reduced-motion` では弱める（消さない）。揺れとフラッシュは止める。

## 構造

`web/client/`（ブラウザに渡るもの）と `web/server/`（ビルド時に HTML
を作るもの）
に分け、**それぞれの直下はゲームごとのディレクトリ**にする。共有物は
`_shared/`。

```
web/
  client/
    _shared/   layout・routes・games 一覧・トップページ・fx（演出エンジン）・music（BGM）・static/
    queens/    page.tsx（ページ）・game.tsx（island）・logic.ts（ルールと生成器）・song.ts（BGM）
  server/
    router.tsx 唯一のエントリ
    _shared/   assets（bundle）・runtime・og 画像・markdown
    queens/    mod.tsx（ページの action）・rules.md（説明）・logic_test.ts・song_test.ts
  tests/       ブラウザ smoke（lightpanda）
```

- **どのゲームも説明の Markdown を 1 つ持つ**: `web/server/<game>/rules.md`。
  ページに `@kuboon/md` でレンダリングして載せる。
- ゲームの island は `web/client/<game>/game.tsx`（`assets.ts` が `*/game.tsx`
  を glob する）。ブラウザ側のコードは `Deno.` を参照しない。
- `client/` の型チェックは `deno.ns` 無しなので、テストは `server/<game>/`
  に置き `client/<game>/logic.ts` を import する。

### ゲームを足すとき

1. `web/client/<game>/` に `page.tsx`・`game.tsx`・`logic.ts`
2. `web/server/<game>/` に `mod.tsx`（action）・`rules.md`・テスト
3. `client/_shared/routes.ts` にルート、`client/_shared/games.ts` に一覧の行、
   `server/router.tsx` の controller に action
4. 演出ルールに従い heat を `fx.setHeat()` に、`musicLevel()` を
   `Music.setLevel()` に渡す （BGM は `client/<game>/song.ts`）

## ドパクイーン

N×N の盤面を N 色の領域に分け、各行・各列・各領域に 1 つずつ、互いに（斜めも）
接しないように N 個のクイーンを置く。

- 盤面はステージ番号を seed に `logic.ts` の `generate()` が決定的に生成する
  （同じステージは誰でも同じ問題）。解は必ず 1 通り（`solve()` で検証し、別解の
  クイーンのマスを隣の領域へ移して潰す）。
- サイズはステージ 1–2 が 5×5、以降 6・7・8・9、25 以降 10×10。
- 進捗（クリア済みステージ、現在のステージ、音・自動 × の設定）は
  `localStorage`。`?stage=N` でも開ける（クリア済み + 1 まで）。

## デプロイ

`.github/workflows/pages.yml` が `deno task build`（`@remix-kbn/ssg`）で
`web/server/router.tsx` を `fetch()` でクロールし、`web/dist` に静的 HTML
を書き出して GitHub Pages へ。main は Pages ルート、PR は preview サブパス
（`BASE_URL` から `base` が決まる）。`/api/*` のようなサーバ機能は持たない。

## 開発

```bash
deno task dev           # 開発サーバー (http://localhost:8000)
deno task build         # 静的サイトを web/dist へ生成
deno task test          # ロジック・ルーターのテスト
deno task test:browser  # ブラウザ smoke テスト (lightpanda)
deno task check         # 型チェック + lint + fmt
```

変更前後に `deno task check && deno task test && deno task build` と
`deno task test:browser` を通す。

## コーディング規約

- Deno ファースト（Web API 優先、Node.js API は必要最小限）
- TypeScript strict mode
- テストは `Deno.test()` + `@std/assert`
- ファイル名はスネークケース（例: `logic_test.ts`）
- 見た目は `@remix-run/component` の `css()` mixin と
  `web/client/_shared/tokens.ts` のトークンで書く（Tailwind 等は使わない）。
  keyframes は `css()` で宣言できないので `client/_shared/static/app.css` に置く
- 追加した `import` は ルートの `deno.json` にだけ書く
