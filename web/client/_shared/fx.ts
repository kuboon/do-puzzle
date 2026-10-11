/**
 * The site's effects engine — every game's juice comes from here.
 *
 * House rule (see `CLAUDE.md`): effects are loud, and they get louder the closer the player is to
 * clearing the stage. Everything below therefore takes or reads a **heat**, `0 … 1`, which a game
 * sets with {@link Fx.setHeat} as the board fills up:
 *
 * - **Ambient** (always on, scaled by heat): a background of drifting colour blobs that saturate,
 *   speed up and start cycling through the rainbow; embers rising from the bottom edge; a hue that
 *   rotates faster and faster, published as `--fx-hue` on `<html>` for any style to pick up.
 * - **Hits** (one per action): particle bursts, shockwave rings, screen shake, flashes, pop-up
 *   text and synthesized sound. A game passes the heat in, so the same move hits harder late.
 * - **Finale**: {@link Fx.celebrate} — hit-stop, white-out, confetti in full bloom, a
 *   short volley of fireworks — then quiet again within a few seconds.
 *
 * `prefers-reduced-motion` tones it down rather than off: fewer particles, no shake, no flashes.
 *
 * Plain DOM and canvas, no component runtime: a game creates one with {@link createFx} once it is
 * in the browser and throws it away with {@link Fx.destroy}.
 */

export interface Fx {
  /** How close the stage is to clear, `0 … 1`. Drives everything ambient. */
  setHeat(heat: number): void;
  /** A particle burst at a page point. */
  burst(x: number, y: number, options?: BurstOptions): void;
  /** An expanding ring at a page point. */
  ring(x: number, y: number, color: string, size?: number): void;
  /** Shakes an element. `power` is roughly pixels. */
  shake(element: HTMLElement, power: number, ms?: number): void;
  /** Covers the screen with a colour for a moment. */
  flash(color: string, alpha?: number, ms?: number): void;
  /** Big text that pops at a page point and floats away. */
  popText(x: number, y: number, text: string, options?: PopOptions): void;
  /** A short synthesized sound. */
  sound(kind: SoundKind, heat?: number, step?: number): void;
  /** Turns sound on or off. Sound starts off until the first user gesture turns it on. */
  setMuted(muted: boolean): void;
  /** The finale: fireworks, confetti, flashes. Resolves when the loudest part is over. */
  celebrate(element: HTMLElement, level?: number): Promise<void>;
  /** The other finale: hit-stop, a blood-red flash, the board shattering. */
  defeat(element: HTMLElement): Promise<void>;
  destroy(): void;
}

export interface BurstOptions {
  count?: number;
  colors?: readonly string[];
  /** Initial speed in px/frame. */
  speed?: number;
  gravity?: number;
  shape?: "spark" | "confetti" | "star";
  /** Frames to live. */
  life?: number;
  size?: number;
}

export interface PopOptions {
  size?: number;
  color?: string;
  /** Rainbow-cycle the text. */
  rainbow?: boolean;
  ms?: number;
}

export type SoundKind =
  | "place"
  | "cross"
  | "error"
  | "clear"
  | "gameover"
  | "tick";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: "spark" | "confetti" | "star" | "ember";
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  color: string;
  life: number;
}

interface Blob {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hue: number;
}

const MAX_PARTICLES = 2500;

export const RAINBOW = [
  "#ff3b6b",
  "#ff8a00",
  "#ffd400",
  "#3ddc84",
  "#00c2ff",
  "#6c5cff",
  "#ff4fd8",
] as const;

/** Creates the engine: two fixed canvases, one behind the page and one in front of it. */
export function createFx(): Fx {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches ?? false;
  const amount = reduced ? 0.25 : 1;

  const back = document.createElement("canvas");
  const front = document.createElement("canvas");
  const flashLayer = document.createElement("div");
  for (
    const [el, z] of [[back, "-1"], [front, "50"], [flashLayer, "60"]] as const
  ) {
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: z,
    });
    el.setAttribute("aria-hidden", "true");
    document.body.append(el);
  }
  flashLayer.style.opacity = "0";

  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");

  let w = 1;
  let h = 1;
  let ratio = 1;
  const fit = () => {
    ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    w = globalThis.innerWidth;
    h = globalThis.innerHeight;
    for (const c of [back, front]) {
      c.width = Math.round(w * ratio);
      c.height = Math.round(h * ratio);
    }
  };
  fit();
  globalThis.addEventListener("resize", fit);

  let heat = 0;
  let shownHeat = 0;
  let hue = 220;
  const particles: Particle[] = [];
  const rings: Ring[] = [];
  const blobs: Blob[] = Array.from({ length: 7 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.25 + Math.random() * 0.25,
    vx: (Math.random() - 0.5) * 0.0015,
    vy: (Math.random() - 0.5) * 0.0015,
    hue: (i * 360) / 7,
  }));
  let fireworksUntil = 0;
  let nextFirework = 0;

  const dark = () =>
    globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

  function add(p: Particle) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  }

  function burst(x: number, y: number, o: BurstOptions = {}) {
    const count = Math.round((o.count ?? 40) * amount);
    const colors = o.colors ?? RAINBOW;
    const speed = o.speed ?? 8;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      const life = (o.life ?? 60) * (0.6 + Math.random() * 0.6);
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (o.shape === "confetti" ? speed * 0.4 : 0),
        life,
        max: life,
        size: (o.size ?? 4) * (0.6 + Math.random() * 0.8),
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: o.shape ?? "spark",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        gravity: o.gravity ?? 0.18,
        drag: o.shape === "confetti" ? 0.96 : 0.94,
      });
    }
  }

  function ring(x: number, y: number, color: string, size = 120) {
    if (reduced) size *= 0.5;
    rings.push({ x, y, r: 4, max: size, color, life: 1 });
  }

  function shake(element: HTMLElement, power: number, ms = 350) {
    if (reduced || power <= 0) return;
    const frames: Keyframe[] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const k = (1 - i / steps) * power;
      const dx = (Math.random() * 2 - 1) * k;
      const dy = (Math.random() * 2 - 1) * k;
      const rot = (Math.random() * 2 - 1) * k * 0.15;
      frames.push({
        transform: i === steps
          ? "none"
          : `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
      });
    }
    element.animate(frames, { duration: ms, easing: "linear" });
  }

  function flash(color: string, alpha = 0.6, ms = 250) {
    if (reduced) alpha *= 0.2;
    flashLayer.style.background = color;
    flashLayer.animate([{ opacity: alpha }, { opacity: 0 }], {
      duration: ms,
      easing: "ease-out",
    });
  }

  function popText(x: number, y: number, text: string, o: PopOptions = {}) {
    const el = document.createElement("div");
    const size = o.size ?? 32;
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      zIndex: "70",
      pointerEvents: "none",
      fontWeight: "900",
      fontSize: `${size}px`,
      whiteSpace: "nowrap",
      fontFamily: "var(--font-sans)",
      letterSpacing: "0.02em",
      color: o.color ?? "#fff",
      WebkitTextStroke: `${Math.max(1, size / 22)}px rgba(0,0,0,0.55)`,
      textShadow: `0 0 ${size / 3}px rgba(255,255,255,0.8)`,
    });
    if (o.rainbow) el.classList.add("fx-rainbow-text");
    document.body.append(el);
    const ms = o.ms ?? 900;
    el.animate([
      {
        transform: "translate(-50%, -50%) scale(0.2) rotate(-12deg)",
        opacity: 0,
      },
      {
        transform: "translate(-50%, -60%) scale(1.35) rotate(4deg)",
        opacity: 1,
        offset: 0.18,
      },
      {
        transform: "translate(-50%, -65%) scale(1) rotate(0deg)",
        opacity: 1,
        offset: 0.5,
      },
      { transform: "translate(-50%, -140%) scale(0.9)", opacity: 0 },
    ], { duration: ms, easing: "cubic-bezier(.2,.8,.3,1)" })
      .finished.finally(() => el.remove());
  }

  // --- sound ------------------------------------------------------------------------------

  let audio: AudioContext | null = null;
  let muted = true;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

  function ensureAudio(): AudioContext | null {
    if (muted) return null;
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") void audio.resume();
      return audio;
    } catch {
      return null;
    }
  }

  function tone(
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slide = 1,
  ) {
    const ac = ensureAudio();
    if (!ac) return;
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function sound(kind: SoundKind, soundHeat = heat, step = 0) {
    const base = 440;
    const note = (n: number) => base * 2 ** (n / 12);
    switch (kind) {
      case "tick":
        tone(1800, 0, 0.03, "square", 0.03);
        break;
      case "cross":
        tone(900, 0, 0.05, "triangle", 0.06, 0.6);
        break;
      case "place": {
        const n = PENTA[Math.min(step, PENTA.length - 1)];
        tone(note(n), 0, 0.25, "triangle", 0.18);
        tone(note(n + 12), 0.03, 0.2, "sine", 0.08 + 0.1 * soundHeat);
        if (soundHeat > 0.5) {
          tone(note(n + 7), 0.06, 0.25, "square", 0.04 * soundHeat);
        }
        if (soundHeat > 0.8) tone(note(n - 12), 0, 0.35, "sawtooth", 0.05, 0.5);
        break;
      }
      case "error":
        tone(160, 0, 0.25, "sawtooth", 0.12, 0.7);
        tone(150, 0.02, 0.25, "square", 0.08, 0.6);
        break;
      case "gameover": {
        // A falling minor line, then a low thud that will not resolve.
        [12, 8, 5, 1].forEach((n, i) =>
          tone(note(n - 12), i * 0.18, 0.35, "square", 0.1, 0.97)
        );
        tone(note(-24), 0.75, 1.6, "sawtooth", 0.14, 0.5);
        tone(note(-23), 0.75, 1.6, "sawtooth", 0.1, 0.5);
        break;
      }
      case "clear": {
        const seq = [0, 4, 7, 12, 16, 19, 24];
        seq.forEach((n, i) => {
          tone(note(n), i * 0.07, 0.4, "triangle", 0.16);
          tone(note(n + 12), i * 0.07, 0.3, "square", 0.04);
        });
        [0, 4, 7, 12].forEach((n) =>
          tone(note(n), 0.55, 1.4, "sawtooth", 0.05)
        );
        break;
      }
    }
  }

  // --- finale ------------------------------------------------------------------------------

  async function celebrate(element: HTMLElement, level = 1) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Hit-stop: hold still a beat, then everything at once.
    await new Promise((r) => setTimeout(r, 140));
    flash("#ffffff", 0.95, 500);
    sound("clear");
    shake(element, 26, 700);
    shake(document.body, 10, 600);
    ring(cx, cy, "#ffffff", Math.max(w, h));
    ring(cx, cy, "#ffd400", Math.max(w, h) * 0.7);
    burst(cx, cy, { count: 400 * level, speed: 22, life: 110, size: 6 });
    burst(cx, cy, {
      count: 200 * level,
      shape: "star",
      speed: 16,
      life: 120,
      size: 9,
    });
    // Confetti in full bloom at once: thrown out hard, braked by drag, and gone in a couple of
    // seconds — a storm that keeps falling would hide the cursor long after the moment has passed.
    const pieces = Math.round(320 * level * amount);
    for (let i = 0; i < pieces; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 10 + Math.random() * 26;
      const life = 70 + Math.random() * 50;
      add({
        x: cx,
        y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 4,
        life,
        max: life,
        size: 6 + Math.random() * 7,
        color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)],
        shape: "confetti",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.5,
        gravity: 0.12,
        drag: 0.9,
      });
    }
    // A short volley of fireworks right after, then quiet.
    const now = performance.now();
    fireworksUntil = now + 1300;
    nextFirework = now + 150;
    await new Promise((r) => setTimeout(r, 450));
    flash("#ff4fd8", 0.5, 400);
    // Then settle: the stage is over, so the ambient storm winds down with it. The next
    // `setHeat` from the game (a new stage) takes it from there.
    await new Promise((r) => setTimeout(r, 900));
    heat = 0;
  }

  async function defeat(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    await new Promise((r) => setTimeout(r, 160));
    flash("#7a0010", 0.9, 900);
    sound("gameover");
    shake(element, 34, 900);
    shake(document.body, 14, 700);
    ring(cx, cy, "#ff0033", Math.max(w, h));
    // The board breaks: dark shards falling hard, sparks of red.
    burst(cx, cy, {
      count: 260,
      shape: "confetti",
      colors: ["#1a1a2e", "#3a3a4e", "#5a0010", "#000000"],
      speed: 18,
      gravity: 0.5,
      life: 140,
      size: 12,
    });
    burst(cx, cy, {
      count: 160,
      colors: ["#ff0033", "#ff5a00", "#ffffff"],
      speed: 20,
      life: 70,
      size: 4,
    });
    await new Promise((r) => setTimeout(r, 500));
    flash("#000000", 0.6, 700);
  }

  // --- frame loop ------------------------------------------------------------------------

  let frame = 0;
  let last = performance.now();
  function tick(now: number) {
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    shownHeat += (heat - shownHeat) * 0.06 * dt;
    // The hue rotates faster as heat rises — lazy drift at 0, a strobe-y spin at 1.
    hue = (hue + (0.15 + shownHeat * shownHeat * 6) * dt) % 360;
    document.documentElement.style.setProperty("--fx-hue", hue.toFixed(1));
    document.documentElement.style.setProperty(
      "--fx-heat",
      shownHeat.toFixed(3),
    );

    if (bctx) drawBack(bctx, dt, now);
    if (fctx) drawFront(fctx, dt, now);
    frame = requestAnimationFrame(tick);
  }

  function drawBack(ctx: CanvasRenderingContext2D, dt: number, now: number) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const d = dark();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = d ? "#07070f" : "#fbf8ff";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = d ? "lighter" : "multiply";
    const sat = 45 + shownHeat * 55;
    const light = d ? 35 + shownHeat * 20 : 80 - shownHeat * 15;
    const alpha = (d ? 0.35 : 0.55) + shownHeat * 0.35;
    const speed = 1 + shownHeat * 6;
    for (const b of blobs) {
      b.x += b.vx * speed * dt;
      b.y += b.vy * speed * dt;
      if (b.x < -0.2 || b.x > 1.2) b.vx *= -1;
      if (b.y < -0.2 || b.y > 1.2) b.vy *= -1;
      const pulse = 1 +
        Math.sin(now / (500 - shownHeat * 350) + b.hue) * 0.15 * shownHeat;
      const r = b.r * Math.max(w, h) * pulse;
      const g = ctx.createRadialGradient(
        b.x * w,
        b.y * h,
        0,
        b.x * w,
        b.y * h,
        r,
      );
      const bh = (b.hue + hue * (0.3 + shownHeat)) % 360;
      g.addColorStop(0, `hsla(${bh}, ${sat}%, ${light}%, ${alpha})`);
      g.addColorStop(1, `hsla(${bh}, ${sat}%, ${light}%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    // Embers: a trickle at rest, a geyser near the end.
    const rate = (0.15 + shownHeat * shownHeat * 6) * amount * dt;
    const embers = Math.min(
      20,
      Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0),
    );
    for (let i = 0; i < embers; i++) {
      add({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(1 + Math.random() * 2.5) * (1 + shownHeat * 2),
        life: 160,
        max: 160,
        size: 1.5 + Math.random() * 2.5 * (1 + shownHeat),
        color: `hsl(${(hue + Math.random() * 120) % 360}, 100%, ${
          d ? 65 : 55
        }%)`,
        shape: "ember",
        rot: 0,
        vr: 0,
        gravity: -0.01,
        drag: 0.995,
      });
    }
  }

  function drawFront(ctx: CanvasRenderingContext2D, dt: number, now: number) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (now < fireworksUntil && now >= nextFirework) {
      nextFirework = now + (reduced ? 600 : 160 + Math.random() * 220);
      const x = w * (0.1 + Math.random() * 0.8);
      const y = h * (0.1 + Math.random() * 0.5);
      const c = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
      burst(x, y, {
        count: 90,
        colors: [c, "#ffffff", RAINBOW[Math.floor(Math.random() * 7)]],
        speed: 9,
        life: 80,
        gravity: 0.08,
        size: 3.5,
      });
      ring(x, y, c, 90);
      if (Math.random() < 0.5) sound("tick");
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += (r.max - r.r) * 0.12 * dt;
      r.life -= 0.03 * dt;
      if (r.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life;
      ctx.lineWidth = 2 + 10 * r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vx *= p.drag ** dt;
      p.vy = p.vy * p.drag ** dt + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > h + 40 || p.y < -60) {
        particles.splice(i, 1);
        continue;
      }
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      if (p.shape === "confetti") {
        ctx.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 2));
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        ctx.globalCompositeOperation = "lighter";
      } else if (p.shape === "star") {
        star(ctx, p.x, p.y, p.size * (0.5 + t * 0.5), p.rot);
      } else if (p.shape === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * t;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  frame = requestAnimationFrame(tick);

  return {
    setHeat(next) {
      heat = Math.max(0, Math.min(1, next));
    },
    burst,
    ring,
    shake,
    flash,
    popText,
    sound,
    setMuted(next) {
      muted = next;
      if (!muted) ensureAudio();
    },
    celebrate,
    defeat,
    destroy() {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("resize", fit);
      back.remove();
      front.remove();
      flashLayer.remove();
      void audio?.close();
    },
  };
}

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
