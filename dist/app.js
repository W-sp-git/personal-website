import { Landscape, Snowfall } from "./scene.js";
import { Ambience } from "./audio.js";

if (document.readyState === "loading")
  await new Promise((resolve) =>
    document.addEventListener("DOMContentLoaded", resolve, { once: true }),
  );
const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const status = document.querySelector(".screen-reader-status");
const images = [...document.querySelectorAll("[data-scene-image]")];
const landscape = new Landscape(document.querySelector("#landscape"), images);
const snow = new Snowfall(document.querySelector("#weather"), landscape);
const ambience = new Ambience();
const slider = document.querySelector("#daylight");
const lightOutput = document.querySelector("#light-state");
const motionButton = document.querySelector(".motion-toggle");
const soundButton = document.querySelector(".sound-toggle");
const journey = document.querySelector(".journey");
const fog = document.querySelector(".fog-transition");
const { gsap, ScrollTrigger } = window;
let route = root.dataset.page;
let homeScroll = 0;
let routeBusy = false;
let manualPause = false;
let scrollTrigger;
let lastChapter = -1;
try {
  manualPause = sessionStorage.getItem("northbound-pause") === "true";
} catch {}

function setLight(value, save = false) {
  value = Math.max(0, Math.min(100, Number(value) || 0));
  slider.value = String(value);
  const label = value < 28 ? "白昼" : value > 76 ? "极夜" : "蓝调";
  lightOutput.textContent = label;
  slider.setAttribute(
    "aria-valuetext",
    `${label}，昼夜刻度 ${Math.round(value)}`,
  );
  root.style.setProperty("--night", value / 100);
  root.dataset.light = value < 28 ? "day" : value > 76 ? "night" : "twilight";
  landscape.setLight(value / 100);
  if (save) {
    try {
      localStorage.setItem("northbound-light", String(value / 100));
    } catch {}
  }
}
let savedLight;
try {
  savedLight = localStorage.getItem("northbound-light");
} catch {}
const initialLight =
  savedLight !== null &&
  savedLight !== undefined &&
  Number.isFinite(Number(savedLight))
    ? Number(savedLight) * 100
    : 60;
setLight(initialLight);
landscape.light = landscape.targetLight;
slider.addEventListener("input", () => setLight(slider.value));
slider.addEventListener("change", () => setLight(slider.value, true));
document
  .querySelectorAll("button[data-light]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setLight(button.dataset.light, true),
    ),
  );

function syncMotion() {
  const paused = manualPause || reduceMotion.matches;
  root.classList.toggle("reduced-motion", paused);
  landscape.setMotion(!paused);
  snow.start();
  const label = reduceMotion.matches
    ? "系统已启用减少动态效果"
    : paused
      ? "恢复动态效果"
      : "暂停动态效果";
  motionButton.setAttribute("aria-label", label);
  motionButton.title = label;
  motionButton.setAttribute("aria-pressed", String(paused));
  motionButton.disabled = reduceMotion.matches;
  motionButton.querySelector("img").src =
    `/assets/icons/${paused ? "play" : "pause"}.svg`;
}
motionButton.addEventListener("click", () => {
  manualPause = !manualPause;
  try {
    sessionStorage.setItem("northbound-pause", String(manualPause));
  } catch {}
  syncMotion();
});
reduceMotion.addEventListener("change", syncMotion);
syncMotion();

soundButton.addEventListener("click", async () => {
  soundButton.disabled = true;
  try {
    const enabled = await ambience.setEnabled(!ambience.enabled);
    soundButton.setAttribute("aria-pressed", String(enabled));
    const label = enabled ? "关闭环境音" : "开启环境音";
    soundButton.setAttribute("aria-label", label);
    soundButton.title = label;
    soundButton.querySelector("img").src =
      `/assets/icons/${enabled ? "speaker-high" : "speaker-slash"}.svg`;
    status.textContent = enabled ? "环境音已开启。" : "环境音已关闭。";
  } catch {
    status.textContent = "暂时无法播放环境音，请稍后再试。";
  } finally {
    soundButton.disabled = false;
  }
});
document.addEventListener("visibilitychange", () => {
  (document.hidden ? ambience.suspend() : ambience.resume()).catch(() => {});
});
window.addEventListener("pagehide", () => {
  ambience.suspend().catch(() => {});
});

function activeChapter(value) {
  const index = Math.max(0, Math.min(2, Math.round(value)));
  if (index === lastChapter) return;
  lastChapter = index;
  root.dataset.chapter = String(index);
  document.querySelectorAll(".chapter-nav a").forEach((link, i) => {
    if (i === index) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  });
}

if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  scrollTrigger = ScrollTrigger.create({
    trigger: journey,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      if (route === "home") {
        landscape.setChapter(self.progress * 2);
        activeChapter(self.progress * 2);
      }
    },
  });
  if (route === "about") scrollTrigger.disable(false);
} else {
  // The full journey remains navigable when the animation library is unavailable.
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting && route === "home") {
          const i = [...journey.children].indexOf(entry.target);
          landscape.setChapter(i);
          activeChapter(i);
        }
      }),
    { rootMargin: "-35% 0px -35% 0px", threshold: 0 },
  );
  [...journey.children].forEach((section) => observer.observe(section));
}
activeChapter(0);

function moveToChapter(index, updateHash = true) {
  const extent = Math.max(0, journey.scrollHeight - innerHeight);
  const top = (extent * index) / 2;
  window.scrollTo({ top, behavior: landscape.motion ? "smooth" : "instant" });
  if (updateHash)
    history.replaceState(
      { route: "home" },
      "",
      index === 0 ? "/" : `/#${index === 1 ? "snow" : "aurora"}`,
    );
  if (!scrollTrigger) {
    landscape.setChapter(index);
    activeChapter(index);
  }
}
document.querySelectorAll("[data-chapter-link]").forEach((link) =>
  link.addEventListener("click", (event) => {
    event.preventDefault();
    moveToChapter(Number(link.dataset.chapterLink));
  }),
);

function applyRoute(next, url, push = true) {
  if (route === "home") homeScroll = scrollY;
  route = next;
  root.dataset.page = next;
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== next;
  });
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === next) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (push) history.pushState({ route: next }, "", url.pathname + url.hash);
  document.title =
    next === "about" ? "关于王舒鹏 · NORTHBOUND" : "向北 NORTHBOUND · 王舒鹏";
  document.querySelector('meta[property="og:title"]').content = document.title;
  document.querySelector('meta[property="og:url"]').content =
    `${location.origin}${next === "about" ? "/about/" : "/"}`;
  document.querySelector('link[rel="canonical"]').href =
    `${location.origin}${next === "about" ? "/about/" : "/"}`;
  if (next === "about") {
    scrollTrigger?.disable(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    landscape.setChapter(0);
  } else {
    scrollTrigger?.enable(false);
    ScrollTrigger?.refresh();
    window.scrollTo({ top: homeScroll, behavior: "instant" });
    scrollTrigger?.update();
    if (url.hash === "#snow" || url.hash === "#aurora")
      moveToChapter(url.hash === "#snow" ? 1 : 2, false);
  }
  document.querySelector("#main").focus({ preventScroll: true });
}

function navigate(url, push = true) {
  const next = url.pathname.startsWith("/about") ? "about" : "home";
  if (routeBusy) return;
  if (next === route) {
    if (next === "home") {
      const chapter = url.hash === "#snow" ? 1 : url.hash === "#aurora" ? 2 : 0;
      moveToChapter(chapter, push);
    }
    return;
  }
  routeBusy = true;
  if (gsap && landscape.motion) {
    fog.classList.add("busy");
    gsap
      .timeline({
        onComplete: () => {
          fog.classList.remove("busy");
          routeBusy = false;
        },
      })
      .fromTo(
        fog,
        { opacity: 0, xPercent: -8 },
        {
          opacity: 0.96,
          xPercent: 0,
          duration: 0.32,
          ease: "power2.inOut",
          onComplete: () => applyRoute(next, url, push),
        },
      )
      .to(fog, { opacity: 0, xPercent: 8, duration: 0.55, ease: "power2.out" });
  } else {
    applyRoute(next, url, push);
    routeBusy = false;
  }
}
document.querySelectorAll("a[data-route]").forEach((link) =>
  link.addEventListener("click", (event) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    navigate(new URL(link.href));
  }),
);
window.addEventListener("popstate", () => {
  navigate(new URL(location.href), false);
});
window.addEventListener("pageshow", () => {
  fog.classList.remove("busy");
  fog.style.opacity = "0";
  routeBusy = false;
});
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
document.querySelectorAll("[data-view]").forEach((view) => {
  view.hidden = view.dataset.view !== route;
});
document.querySelectorAll("[data-nav]").forEach((link) => {
  if (link.dataset.nav === route) link.setAttribute("aria-current", "page");
  else link.removeAttribute("aria-current");
});
if (route === "about") document.title = "关于王舒鹏 · NORTHBOUND";

let pointerDown;
document.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || !landscape.motion) return;
  landscape.targetPointer = [
    (event.clientX / innerWidth - 0.5) * 2,
    (0.5 - event.clientY / innerHeight) * 2,
  ];
});
document.addEventListener("pointerleave", () => {
  landscape.targetPointer = [0, 0];
});
document.addEventListener(
  "pointerdown",
  (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  },
  { passive: true },
);
document.addEventListener(
  "pointerup",
  (event) => {
    if (
      !pointerDown ||
      route !== "home" ||
      event.target.closest("a,button,input,label") ||
      event.clientY < innerHeight * 0.63
    )
      return;
    if (
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <
      12
    )
      landscape.ripple(
        event.clientX / innerWidth,
        1 - event.clientY / innerHeight,
      );
    pointerDown = null;
  },
  { passive: true },
);

const loading = document.querySelector(".loading-note");
const loadingTimer = setTimeout(() => {
  loading.hidden = false;
}, 1400);
landscape.load().then(() => {
  clearTimeout(loadingTimer);
  loading.hidden = true;
  root.dataset.ready = "true";
});
document.fonts.ready.then(() => ScrollTrigger?.refresh());
if (
  route === "home" &&
  (location.hash === "#snow" || location.hash === "#aurora")
)
  requestAnimationFrame(() =>
    moveToChapter(location.hash === "#snow" ? 1 : 2, false),
  );
if (route === "home" && !location.hash) {
  window.scrollTo({ top: 0, behavior: "instant" });
  landscape.setChapter(0);
}
document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});
