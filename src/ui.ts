import type { Art, Game } from "./api";
import { esc } from "./format";

const svg = (body: string, size = 22, filled = false, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${
    filled
      ? `fill="currentColor" stroke="none"`
      : `fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
  }>${body}</svg>`;

export const icon = {
  search: () => svg(`<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`),
  download: () => svg(`<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>`),
  settings: () =>
    svg(
      `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
    ),
  play: () => svg(`<path d="M7 4.5v15l12.5-7.5z"/>`, 18, true),
  more: () =>
    svg(`<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>`, 22, true),
  next: () => svg(`<path d="M9 6l6 6-6 6"/>`, 18, false, 2.2),
  back: () => svg(`<path d="M15 6l-6 6 6 6"/>`, 18, false, 2.2),
  grid: () =>
    svg(
      `<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>`,
      26,
    ),
  trophy: () =>
    svg(`<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/>`, 22, false, 2.2),
  lock: () =>
    svg(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`, 22, false, 2.2),
};

/** CSS custom properties of a game's art, for an element's style attribute. */
export function artVars(a: Art): string {
  return `--bg:${a.bg};--a1:${a.a1};--a2:${a.a2};--cx:${a.cx}%;--cy:${a.cy}%;--rot:${a.rot}deg`;
}

/**
 * A game's cover: its library picture over its generated art, which shows
 * with the title when there is no picture or it fails to load. The element
 * around it sets artVars.
 */
export function cover(g: Game, label = true): string {
  return `<span class="cover-orb"></span><span class="cover-band"></span>${
    g.cover
      ? `<img class="cover-img" src="${esc(g.cover)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : ""
  }${label ? `<span class="cover-label">${esc(g.title)}</span>` : ""}`;
}

/** A game's wide picture, which fades in over the generated backdrop. */
export function hero(g: Game): string {
  return g.hero
    ? `<img class="hero-img" src="${esc(g.hero)}" alt="" decoding="async" onload="this.classList.add('hero-on')" onerror="this.remove()">`
    : "";
}

/** Keyboard hint of the console footer. */
export function hint(key: string, label: string): string {
  return `<span class="hint"><kbd>${esc(key)}</kbd>${esc(label)}</span>`;
}
