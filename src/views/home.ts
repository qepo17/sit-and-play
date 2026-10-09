import type { Account, Game } from "../api";
import { ago, date, esc, hours } from "../format";
import { shortcutOf, type Command } from "../shortcuts";
import { artVars, cover, hero, hint, icon } from "../ui";
import { header } from "./header";

export function homeView(games: Game[], selected: Game, account: Account): string {
  return `
<div class="home" style="${artVars(selected.art)}">
  <div class="backdrop" aria-hidden="true">
    <div class="backdrop-orb"></div>
    <div class="backdrop-band"></div>
    <div class="backdrop-ring"></div>
  </div>
  <div class="hero" aria-hidden="true">${hero(selected)}</div>
  <div class="home-body">
    ${header("home", account)}
    <div class="game-row" role="toolbar" aria-label="Games">${gameRow(games, selected)}</div>
    <div class="grow"></div>
    <section class="selected" aria-label="Selected game" aria-live="polite">${selectedGame(selected)}</section>
    <div class="stat-cards">${stats(selected, account)}</div>
    <footer class="hints">${hints(selected)}</footer>
  </div>
</div>`;
}

export function hints(g: Game): string {
  return (
    keyHint(["confirm"], g.installed ? "Play" : "Install") +
    keyHint(["left", "right"], "Browse") +
    keyHint(["down"], "Game hub") +
    keyHint(["prevTab", "nextTab"], "Switch tab") +
    keyHint(["shortcuts"], "Shortcuts")
  );
}

/** The hint of commands with their first keys, "" if one has no key. */
function keyHint(ids: Command[], label: string): string {
  const keys = ids.map(shortcutOf);
  return keys.every(Boolean) ? hint(keys.join("  "), label) : "";
}

export function gameRow(games: Game[], selected: Game): string {
  return (
    games
      .map((g) =>
        g.id === selected.id
          ? `<div class="tile-on">
  <button type="button" class="tile tile-selected" style="${artVars(g.art)}" aria-label="${esc(g.title)}" aria-pressed="true" data-action="select" data-id="${g.id}">${cover(g)}</button>
  <span class="tile-title">${esc(g.title)}</span>
</div>`
          : `<button type="button" class="tile" style="${artVars(g.art)}" aria-label="${esc(g.title)}" aria-pressed="false" data-action="select" data-id="${g.id}" tabindex="-1">${cover(g, false)}</button>`,
      )
      .join("") +
    `<button type="button" class="tile tile-library" aria-label="Open game library" data-action="nav" data-to="library" tabindex="-1">${icon.grid()}Library</button>`
  );
}

export function selectedGame(g: Game): string {
  return `
${g.genre ? `<div class="eyebrow">${esc(g.genre)}</div>` : ""}
<h1 class="display">${esc(g.title)}</h1>
${g.blurb ? `<p class="blurb">${esc(g.blurb)}</p>` : ""}
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

/** "3 days ago", or "Never played". */
export function lastPlayed(g: Game): string {
  return g.lastPlayed ? `Last played ${ago(g.lastPlayed)}` : "Never played";
}

export function stats(g: Game, account: Account): string {
  return `
<div class="stat-card">
  <div class="caps">${g.installed ? "Installed" : "Store price"}</div>
  <div class="stat-value">${g.installed ? `${g.sizeGB} GB` : esc(g.price.now || "Not sold")}</div>
  <div class="stat-sub">${g.installed ? "Ready to play" : g.price.discount ? `${g.price.discount}% off today` : g.released ? `Released ${date(g.released)}` : ""}</div>
</div>
<div class="stat-card">
  <div class="caps">Playtime</div>
  <div class="stat-value">${hours(g.hours)}</div>
  <div class="stat-sub">${lastPlayed(g)}</div>
</div>
<div class="stat-card">
  <div class="caps">Achievements</div>
  ${achievementStat(g, account)}
</div>`;
}

function achievementStat(g: Game, account: Account): string {
  if (!account.connected)
    return `<div class="stat-value">—</div><button type="button" class="stat-link" data-action="connect">Connect Steam account${icon.next()}</button>`;
  if (!g.detailed) return `<div class="stat-value stat-loading">Loading…</div>`;
  if (!g.achievementsTotal) return `<div class="stat-value">None</div><div class="stat-sub">This game has no achievements</div>`;
  const pct = Math.round((g.achievementsUnlocked / g.achievementsTotal) * 100);
  return `<div class="stat-value">${g.achievementsUnlocked} of ${g.achievementsTotal}</div>
  <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Achievements unlocked"><div style="width:${pct}%"></div></div>`;
}
