/**
 * The document shell.
 *
 * A component like any other: a setup function that returns a render function, placed as
 * `<Layout title={…}>…</Layout>` by `server/router.tsx`. It writes `<head>`, a header with one link
 * per game, the page, and a footer.
 *
 * What turns this tree into a response is `context.render`, from the `render({ assets })`
 * middleware in `router.tsx` — `renderToStream`, which is what lets the runtime keep a plain
 * `<a href>` a soft navigation on a page with islands.
 *
 * The one stylesheet it links is `static/app.css`: tokens, document defaults, keyframes, and the
 * `@layer base, rmx, app` statement the cascade hangs off. It has to come first in `<head>`.
 */

import { css, type Handle, type RemixNode } from "@remix-run/component";

import { base, BASE_META_NAME } from "./base.ts";
import { games } from "./games.ts";
import { routes } from "./routes.ts";
import { color, contentWidth } from "./tokens.ts";

/** The site's name: the header brand, the social cards' eyebrow, the `<title>` suffix. */
export const SITE_NAME = "ドパズル";

/** What every page hands the shell. */
export interface LayoutProps {
  title: string;
  description?: string;
  /** The page's social card URL, or `null` where there is none. */
  image: string | null;
  /** The page's viewport meta, for a page that needs its own. */
  viewport?: string;
  /** The client runtime, for a page that places an island; `null` for one that ships no JS. */
  script: ClientRuntime | null;
  children: RemixNode;
}

/** Where the client runtime lives, and what it pulls in behind it. */
export interface ClientRuntime {
  src: string;
  /** The chunks it imports, for `<link rel="modulepreload">`. */
  preloads: readonly string[];
}

/**
 * What every page module exports: a component, plus what the shell needs to frame it.
 *
 * `hydrate` is required rather than optional: an omitted flag looks exactly like a page that ships
 * nothing, and the page still renders — with nothing on it working.
 */
export interface PageModule<Props = Record<string, never>> {
  default: (handle: Handle<Props>) => () => RemixNode;
  title: string;
  description?: string;
  /** Whether the page places a client entry, so the shell boots the runtime for it. */
  hydrate: boolean;
  viewport?: string;
}

/** Renders a page inside the document shell. */
export function Layout(handle: Handle<LayoutProps>) {
  return () => {
    const props = handle.props;

    return (
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content={props.viewport ?? "width=device-width, initial-scale=1"}
          />
          <title>{props.title}</title>
          {props.description
            ? <meta name="description" content={props.description} />
            : null}
          <meta property="og:type" content="website" />
          <meta property="og:title" content={props.title} />
          {props.description
            ? <meta property="og:description" content={props.description} />
            : null}
          {props.image
            ? (
              <>
                <meta property="og:image" content={props.image} />
                <meta name="twitter:card" content="summary_large_image" />
              </>
            )
            : null}
          {/* The deploy prefix, for the browser — see `base.ts`. */}
          <meta name={BASE_META_NAME} content={base} />
          <link rel="stylesheet" href={`${base}/static/app.css`} />
          <link
            rel="icon"
            type="image/svg+xml"
            href={`${base}/static/favicon.svg`}
          />
          {(props.script?.preloads ?? []).map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
        </head>
        <body>
          <header mix={[bandStyle, headerStyle]}>
            <a mix={brandStyle} href={routes.home.href()}>{SITE_NAME}</a>
            <nav mix={navStyle}>
              {games.map((game) => (
                <a key={game.id} href={game.href} mix={navLinkStyle}>
                  {game.icon} {game.name}
                </a>
              ))}
            </nav>
          </header>
          <main mix={[bandStyle, mainStyle]}>{props.children}</main>
          <footer mix={[bandStyle, footerStyle]}>
            <p>
              Built with <a href="https://remix.run">Remix v3</a> on{" "}
              <a href="https://deno.com">Deno</a>.
            </p>
          </footer>
          {props.script
            ? <script type="module" src={props.script.src}></script>
            : null}
        </body>
      </html>
    );
  };
}

// --- styles -----------------------------------------------------------------

const bandStyle = css({
  width: "100%",
  maxWidth: contentWidth,
  marginInline: "auto",
  paddingInline: "1rem",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  paddingBlock: "1rem",
});

const brandStyle = css({
  fontWeight: 900,
  fontSize: "1.3rem",
  letterSpacing: "0.08em",
  textDecoration: "none",
  color: "transparent",
  backgroundImage:
    "linear-gradient(90deg, #ff3b6b, #ff8a00, #ffd400, #3ddc84, #00c2ff, #6c5cff, #ff4fd8, #ff3b6b)",
  backgroundSize: "200% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  animation: "fx-slide 4s linear infinite",
});

const navStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
});

const navLinkStyle = css({
  fontWeight: 800,
  textDecoration: "none",
  color: color.fg,
  padding: "0.2rem 0.7rem",
  borderRadius: "999px",
  border: `2px solid ${color.border}`,
  transition: "transform 120ms ease",
  "&:hover": {
    transform: "scale(1.08) rotate(-2deg)",
    borderColor: color.accent,
  },
});

const mainStyle = css({ paddingBlock: "1rem 2.5rem" });

const footerStyle = css({
  paddingBlock: "2rem",
  color: color.muted,
  fontSize: "0.85rem",
});
