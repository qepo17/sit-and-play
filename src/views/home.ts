import type { Game } from "../api";
import { ago, date, esc, hours, rupiah } from "../format";
import { artVars, coverShapes, hint, icon } from "../ui";
import { header } from "./header";

export function homeView(games: Game[], selected: Game): string {
  return `
<div class="home" style="${artVars(selected.art)}">
  <div class="backdrop" aria-hidden="true">
    <div class="backdrop-orb"></div>
    <div class="backdrop-band"></div>
    <div class="backdrop-ring"></div>
  </div>
  <div class="home-body">
    ${header("home", true)}
    <div class="game-row" role="toolbar" aria-label="Games">${gameRow(games, selected)}</div>
    <div class="grow"></div>
    <section class="selected" aria-label="Selected game" aria-live="polite">${selectedGame(selected)}</section>
    <div class="stat-cards">${stats(selected)}</div>
    <footer class="hints">
      ${hint("Enter", "Play")}${hint("←  →", "Browse")}${hint("↓", "Game hub")}${hint("Q  E", "Switch tab")}
    </footer>
  </div>
</div>`;
}

export function gameRow(games: Game[], selected: Game): string {
  return (
    games
      .map((g) =>
        g.id === selected.id
          ? `<div class="tile-on">
  <button type="button" class="tile tile-selected" style="${artVars(g.art)}" aria-label="${esc(g.title)}" aria-pressed="true" data-action="select" data-id="${g.id}">${coverShapes(g.title)}</button>
  <span class="tile-title">${esc(g.title)}</span>
</div>`
          : `<button type="button" class="tile" style="${artVars(g.art)}" aria-label="${esc(g.title)}" aria-pressed="false" data-action="select" data-id="${g.id}" tabindex="-1">${coverShapes()}</button>`,
      )
      .join("") +
    `<button type="button" class="tile tile-library" aria-label="Open game library" data-action="nav" data-to="library" tabindex="-1">${icon.grid()}Library</button>`
  );
}

export function selectedGame(g: Game): string {
  return `
<div class="eyebrow">${esc(g.genre)}</div>
<h1 class="display">${esc(g.title)}</h1>
<p class="blurb">${esc(g.blurb)}</p>
<div class="actions">
  ${playButton(g)}
  <button type="button" class="round-button" aria-label="More options" aria-haspopup="menu" data-action="more" data-id="${g.id}">${icon.more()}</button>
  <button type="button" class="pill-link" data-action="nav" data-to="hub">Game hub${icon.next()}</button>
</div>`;
}

export function playButton(g: Game): string {
  return g.installed
    ? `<button type="button" class="play" data-action="play" data-id="${g.id}">${icon.play()}Play</button>`
    : `<button type="button" class="play" data-action="install" data-id="${g.id}">${icon.download()}Install</button>`;
}

export function stats(g: Game): string {
  const pct = Math.round((g.achievementsUnlocked / g.achievementsTotal) * 100);
  return `
<div class="stat-card">
  <div class="caps">Purchased</div>
  <div class="stat-value">${date(g.purchasedOn)}</div>
  <div class="stat-sub">${g.pricePaid ? `Paid ${rupiah(g.pricePaid)}` : "Free to play"}</div>
</div>
<div class="stat-card">
  <div class="caps">Playtime</div>
  <div class="stat-value">${hours(g.hours)}</div>
  <div class="stat-sub">Last played ${ago(g.lastPlayed)}</div>
</div>
<div class="stat-card">
  <div class="caps">Achievements</div>
  <div class="stat-value">${g.achievementsUnlocked} of ${g.achievementsTotal}</div>
  <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Achievements unlocked"><div style="width:${pct}%"></div></div>
</div>`;
}
