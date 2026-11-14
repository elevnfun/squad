// The home-page intro's before-paint switch, written into <head> by layout.tsx.
//
// INTRO_DECIDE runs before the first paint: the intro plays on the home page, once per browser
// session, unless the visitor prefers reduced motion. It marks <html> with "intro-on" (which makes
// the server-rendered cover visible, see Intro.tsx) and "intro-dot-hidden" (the logo's dot waits for
// the ball to land there).
export const INTRO_DECIDE =
  `try{var d=document.documentElement;if(location.pathname==="/"&&!location.hash&&!sessionStorage.getItem("elevn-intro-seen")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("intro-on","intro-dot-hidden")}}catch(e){}`;

// The video's frame, where its ball is on the last frame (in video pixels), and how the frame is
// anchored when it's cropped to fill the screen (a little right of centre keeps the strike in view).
export const INTRO_VIDEO = { width: 1280, height: 720, ball: { x: 822, y: 342, d: 85 }, anchorX: 0.62 };
