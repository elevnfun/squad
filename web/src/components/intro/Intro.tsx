"use client";

// The opening animation on the home page: a full-screen video of the elevn striker volleying at goal.
// The moment the ball leaves his boot, the site takes over: the scene whips past like the camera
// following the shot, the ball keeps flying, the "elevn." logo folds in, and the ball lands as its dot.
//
// The cover (video, blurred still, ball) is rendered on the server, and a script in <head> (markup.ts)
// shows it from the first paint, so the page opens straight on the video; the video carries autoplay
// in the HTML, and its poster is its own first frame. This component then drives it and removes it. The flight runs
// on the compositor (Web Animations, transform and opacity only), so it stays smooth while the rest of
// the page is still loading. If the video can't start within 5 s the logo simply appears.
import { useLayoutEffect, useState } from "react";
import gsap from "gsap";
import { INTRO_VIDEO } from "./markup";

const SEEN = "elevn-intro-seen";
export const INTRO_DONE = "elevn:intro-done";
const DOT = "#f2c14e";            // the logo dot: gold
const STOP_IF_OFF = `(function(){var v=document.getElementById("intro-video");if(v&&!document.documentElement.classList.contains("intro-on")){v.removeAttribute("autoplay");v.preload="none";v.removeAttribute("src");try{v.load()}catch(e){}}})()`;

declare global {
  interface Window { __elevnIntro?: "playing" | "done" }
}

// Strict Mode runs effects twice in development; a clean-up followed straight away by a re-run
// must not end the intro, so finishing on unmount is deferred and cancelled by the re-run.
let pendingFinish: number | undefined;

const FILL: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
  objectPosition: `${INTRO_VIDEO.anchorX * 100}% 50%`, willChange: "transform, opacity" };

export default function Intro() {
  const [show, setShow] = useState(true);
  useLayoutEffect(() => {
    window.clearTimeout(pendingFinish);
    const html = document.documentElement;
    const cover = document.getElementById("intro-cover");
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
    const vid = $<HTMLVideoElement>("intro-video"), still = $<HTMLImageElement>("intro-whip");
    const bx = $("intro-fly-x"), by = $("intro-fly-y"), dot = $("intro-ball");
    if (!html.classList.contains("intro-on") || !cover || !vid || !still || !bx || !by || !dot) {
      if (window.__elevnIntro !== "playing") window.__elevnIntro = "done";
      setShow(false);
      return;
    }
    window.__elevnIntro = "playing";
    const timers: number[] = [];
    const anims: Animation[] = [];
    let handedOff = false;

    let logoShown = false;
    const showLogo = () => {
      if (logoShown) return;
      logoShown = true;
      window.dispatchEvent(new Event(INTRO_DONE));
    };
    const finish = () => {
      if (window.__elevnIntro === "done") return;
      showLogo();
      window.__elevnIntro = "done";
      try { sessionStorage.setItem(SEEN, "1"); } catch {}
      html.classList.remove("intro-on", "intro-dot-hidden");
      setShow(false);
    };

    // Where the ball lands: the ink of the "." in the opening screen's logo. Its box comes from the
    // DOM (without the fold); the square dot inside it from the font's own metrics.
    const target = () => {
      const piece = document.querySelector<HTMLElement>('.logo-fold .fold-text-piece[data-fold-text="."]');
      if (!piece) return { x: innerWidth * 0.62, y: innerHeight * 0.52, size: 16 };
      const t = piece.style.transform; piece.style.transform = "none";
      const r = piece.getBoundingClientRect();
      const text = [...piece.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      const range = document.createRange();
      if (text) range.selectNodeContents(text);
      const content = text ? range.getBoundingClientRect() : r;
      piece.style.transform = t;
      const cs = getComputedStyle(piece);
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return { x: r.left + r.width / 2, y: r.bottom - r.height * 0.2, size: r.width * 0.6 };
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(".");
      const baseline = content.top + m.fontBoundingBoxAscent;
      const left = r.left - m.actualBoundingBoxLeft, right = r.left + m.actualBoundingBoxRight;
      const top = baseline - m.actualBoundingBoxAscent, bottom = baseline + m.actualBoundingBoxDescent;
      return { x: (left + right) / 2, y: (top + bottom) / 2, size: Math.max(right - left, bottom - top) };
    };

    // The hand-off: our ball replaces the video's at the same spot and carries on into the logo.
    const handOff = () => {
      if (handedOff) return;
      handedOff = true;
      const { width: VW, height: VH, ball: B, anchorX } = INTRO_VIDEO;
      const s = Math.max(innerWidth / VW, innerHeight / VH);
      const ox = (innerWidth - VW * s) * anchorX, oy = (innerHeight - VH * s) / 2;
      const d = B.d * s, sx = B.x * s + ox - d / 2, sy = B.y * s + oy - d / 2;
      const end = target();
      const ex = end.x - d / 2, ey = end.y - d / 2, apex = Math.min(ey, sy) - innerHeight * 0.16;
      Object.assign(dot.style, { width: `${d}px`, height: `${d}px`, opacity: "1" });
      const run = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
        anims.push(el.animate(frames, { fill: "forwards", ...opts }));
      };
      // the camera follows the shot: a pre-blurred still of this frame flashes in (smearing the video's
      // own ball into a trail), and the scene rushes past the other way, dissolving into the pitch
      still.style.opacity = "1";
      cover.style.background = "transparent";
      const sweep: Keyframe[] = [{ transform: "translateX(0) scale(1)", opacity: 1 }, { transform: "translateX(-14%) scale(1.18)", opacity: 0 }];
      run(vid, sweep, { duration: 450, easing: "cubic-bezier(.55,.06,.68,.19)" });
      run(still, sweep, { duration: 450, easing: "cubic-bezier(.55,.06,.68,.19)" });
      // the flight: on along the line of the shot, then an arc down into the dot, spinning and shrinking
      run(bx, [{ transform: `translateX(${sx}px)` }, { transform: `translateX(${ex}px)` }], { duration: 1000, easing: "cubic-bezier(.22,.61,.36,1)" });
      run(by, [
        { transform: `translateY(${sy}px)`, easing: "cubic-bezier(.25,.46,.45,.94)" },
        { transform: `translateY(${apex}px)`, offset: 0.45, easing: "cubic-bezier(.55,.06,.68,.19)" },
        { transform: `translateY(${ey}px)` },
      ], { duration: 1000 });
      run(dot, [{ transform: "rotate(0deg) scale(1)" }, { transform: `rotate(720deg) scale(${end.size / d})` }],
        { duration: 1000, easing: "cubic-bezier(.55,.085,.68,.53)" });
      // the landing: the ball squares off into the logo's pink dot, then the real dot takes its place
      run(dot, [{ backgroundColor: "#ffffff", borderRadius: "50%" }, { backgroundColor: DOT, borderRadius: `${(2 * d) / end.size}px` }],
        { duration: 160, delay: 920, easing: "ease-out" });
      if (dot.firstElementChild) run(dot.firstElementChild, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 920 });
      timers.push(window.setTimeout(showLogo, 150));
      timers.push(window.setTimeout(() => {
        html.classList.remove("intro-dot-hidden");
        const seg = document.querySelector<HTMLElement>('.logo-fold .fold-text-segment:has(> [data-fold-text="."])');
        if (seg) gsap.fromTo(seg, { scale: 1.45, transformOrigin: "50% 80%" }, { scale: 1, duration: 0.35, ease: "back.out(3)", clearProps: "transform" });
        dot.style.opacity = "0";
      }, 1090));
      timers.push(window.setTimeout(finish, 1250));
    };

    if (vid.ended) handOff();
    else {
      vid.addEventListener("ended", handOff);
      if (vid.paused) vid.play().catch(finish);
    }
    vid.addEventListener("error", finish);
    // If the video hasn't started within a few seconds, don't keep visitors waiting.
    timers.push(window.setTimeout(() => { if (!handedOff && !vid.currentTime) finish(); }, 5000));

    return () => {
      vid.removeEventListener("ended", handOff);
      vid.removeEventListener("error", finish);
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.cancel());
      if (handedOff) { handedOff = false; dot.style.opacity = "0"; still.style.opacity = "0"; cover.style.background = ""; }
      pendingFinish = window.setTimeout(finish, 0);
    };
  }, []);

  if (!show) return null;
  return (
    <div id="intro-cover" aria-hidden="true">
      {/* suppressHydrationWarning: when the intro is off, the script below strips src/autoplay/preload
          before React loads, so those attributes differ from the server's on purpose */}
      <video id="intro-video" src="/intro/elevn-intro.mp4" poster="/intro/elevn-intro-poster.jpg"
        autoPlay muted playsInline preload="auto" style={FILL} suppressHydrationWarning />
      {/* when the intro is off, stop the hidden video from loading at all (runs as the HTML is parsed) */}
      <script dangerouslySetInnerHTML={{ __html: STOP_IF_OFF }} />
      <img id="intro-whip" src="/intro/elevn-intro-whip.jpg" alt="" style={{ ...FILL, opacity: 0 }} />
      <div id="intro-fly-x" style={{ position: "absolute", left: 0, top: 0, willChange: "transform" }}>
        <div id="intro-fly-y" style={{ willChange: "transform" }}>
          <div id="intro-ball" style={{ borderRadius: "50%", background: "#fff", opacity: 0, willChange: "transform" }}>
            <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%",
              backgroundImage: "radial-gradient(circle at 35% 30%,#ffffff 0%,#f1f4f8 45%,#c9d3df 80%,#9fb0c4 100%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
