/**
 * The home page: one big card per game.
 */

import { css, type Handle } from "@remix-run/component";

import { games } from "./games.ts";
import { SITE_NAME } from "./layout.tsx";
import { color, radius } from "./tokens.ts";

export const title = SITE_NAME;
export const description = "ブラウザで遊べるパズルゲーム集。派手に解け。";

/** No island here: the home page ships no JavaScript. */
export const hydrate = false;

export default function Home(_handle: Handle) {
  return () => (
    <>
      <h1 mix={heroStyle}>{SITE_NAME}</h1>
      <p mix={leadStyle}>
        ブラウザで遊べるパズルゲーム集。サーバ不要、派手さ全開。
      </p>
      <ul mix={gridStyle}>
        {games.map((game, i) => (
          <li key={game.id}>
            <a
              href={game.href}
              mix={cardStyle}
              style={{ animationDelay: `${i * -0.7}s` }}
            >
              <span mix={iconStyle}>{game.icon}</span>
              <strong mix={nameStyle}>{game.name}</strong>
              <span mix={taglineStyle}>{game.tagline}</span>
              <span mix={playStyle}>PLAY ▶</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

const heroStyle = css({
  fontSize: "clamp(2.8rem, 12vw, 5.5rem)",
  fontWeight: 900,
  letterSpacing: "0.04em",
  lineHeight: 1,
  marginBlock: "1.5rem 0.5rem",
  color: "transparent",
  backgroundImage:
    "linear-gradient(90deg, #ff3b6b, #ff8a00, #ffd400, #3ddc84, #00c2ff, #6c5cff, #ff4fd8, #ff3b6b)",
  backgroundSize: "200% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  animation: "fx-slide 3s linear infinite",
  filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.25))",
});

const leadStyle = css({ color: color.muted, fontWeight: 600 });

const gridStyle = css({
  listStyle: "none",
  padding: 0,
  marginBlock: "2rem",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
  gap: "1.25rem",
});

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  padding: "1.5rem",
  borderRadius: radius.lg,
  textDecoration: "none",
  color: "#1a1a2e",
  background: "linear-gradient(135deg, #ffd400, #ff8a00 45%, #ff3b6b)",
  boxShadow: "0 8px 0 #1a1a2e33, 0 0 40px #ff4fd855",
  animation: "fx-float 2.4s ease-in-out infinite",
  transition: "transform 150ms cubic-bezier(.2,.8,.3,1.4)",
  "&:hover": { transform: "scale(1.06) rotate(-1.5deg)" },
});

const iconStyle = css({
  fontSize: "3.5rem",
  lineHeight: 1,
  animation: "fx-wobble 1.6s ease-in-out infinite",
  transformOrigin: "50% 80%",
  display: "inline-block",
  width: "fit-content",
});

const nameStyle = css({
  fontSize: "1.8rem",
  fontWeight: 900,
  letterSpacing: "0.06em",
});

const taglineStyle = css({ fontWeight: 600, fontSize: "0.95rem" });

const playStyle = css({
  marginTop: "0.5rem",
  alignSelf: "flex-start",
  fontWeight: 900,
  padding: "0.3rem 0.9rem",
  borderRadius: "999px",
  background: "#1a1a2e",
  color: "#ffd400",
});
