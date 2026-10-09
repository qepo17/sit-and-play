import type { Account, Game } from "../api";
import { ago, esc, hours } from "../format";
import { artVars, cover } from "../ui";
import { header } from "./header";

export type LibraryTab = "installed" | "collection" | "recent";
export type LibrarySort = "recent" | "hours" | "name" | "size";

export interface LibraryState {
  tab: LibraryTab;
  query: string;
  sort: LibrarySort;
}

const tabs: [LibraryTab, string][] = [
  ["installed", "Installed"],
  ["collection", "Your collection"],
  ["recent", "Last two weeks"],
];

const sorts: [LibrarySort, string][] = [
  ["recent", "Last played"],
  ["hours", "Most played"],
  ["name", "Name"],
  ["size", "Size on disk"],
];

export function libraryView(games: Game[], s: LibraryState, account: Account): string {
  const installed = games.filter((g) => g.installed);
  const size = installed.reduce((sum, g) => sum + g.sizeGB, 0);
  const played = games.reduce((sum, g) => sum + g.hours, 0);
  return `
<div class="library">
  ${header("library")}
  <div class="filters" role="group" aria-label="Show">
    ${tabs
      .map(
        ([id, label]) =>
          `<button type="button" class="filter" aria-pressed="${s.tab === id}" data-action="lib-tab" data-tab="${id}">${label}</button>`,
      )
      .join("")}
  </div>
  <div class="stat-cards">
    <div class="stat-card stat-card-flat"><div class="caps">${account.connected ? "Games owned" : "Games played here"}</div><div class="stat-big">${games.length}</div></div>
    <div class="stat-card stat-card-flat"><div class="caps">Installed</div><div class="stat-big">${installed.length} <span class="stat-unit">· ${Math.round(size)} GB</span></div></div>
    <div class="stat-card stat-card-flat"><div class="caps">Total playtime</div><div class="stat-big">${hours(Math.round(played))}</div></div>
  </div>
  <div class="list-head">
    <h1 class="list-title">${tabs.find(([id]) => id === s.tab)![1]}</h1>
    <div class="controls">
      <div class="control">
        <label for="lib-search">Search</label>
        <input id="lib-search" type="search" placeholder="Game title" autocomplete="off" value="${esc(s.query)}" />
      </div>
      ${
        s.tab === "recent"
          ? ""
          : `<div class="control">
        <label for="lib-sort">Sort by</label>
        <select id="lib-sort">${sorts
          .map(([id, label]) => `<option value="${id}"${s.sort === id ? " selected" : ""}>${label}</option>`)
          .join("")}</select>
      </div>`
      }
    </div>
  </div>
  <div id="lib-results">${libraryResults(games, s)}</div>
</div>`;
}

export function libraryResults(games: Game[], s: LibraryState): string {
  const q = s.query.trim().toLowerCase();
  const match = (g: Game) => !q || g.title.toLowerCase().includes(q);
  return s.tab === "recent" ? recent(games, s, match) : grid(games, s, match);
}

const playedAt = (g: Game) => (g.lastPlayed ? Date.parse(g.lastPlayed) : 0);

const noMatch = (s: LibraryState, nothing: string) =>
  `<p class="empty-state">${s.query.trim() ? `No games match “${esc(s.query.trim())}”.` : nothing}</p>`;

function grid(games: Game[], s: LibraryState, match: (g: Game) => boolean): string {
  const by: Record<LibrarySort, (a: Game, b: Game) => number> = {
    recent: (a, b) => playedAt(b) - playedAt(a),
    hours: (a, b) => b.hours - a.hours,
    name: (a, b) => a.title.localeCompare(b.title),
    size: (a, b) => b.sizeGB - a.sizeGB,
  };
  const shown = games.filter((g) => (s.tab !== "installed" || g.installed) && match(g)).sort(by[s.sort]);
  if (!shown.length) return noMatch(s, "No games are installed. Install them from your collection.");
  return `<div class="lib-grid">${shown
    .map(
      (g) => `
  <button type="button" class="lib-card" data-action="open" data-id="${g.id}">
    <span class="cover" style="${artVars(g.art)}" aria-hidden="true">${cover(g)}</span>
    <span class="lib-card-title">${esc(g.title)}</span>
    <span class="lib-card-meta"><span>${
      g.installed ? `${g.sizeGB} GB` : g.lastPlayed ? ago(g.lastPlayed) : "Never played"
    }</span><b>${hours(g.hours)}</b></span>
  </button>`,
    )
    .join("")}</div>`;
}

function recent(games: Game[], s: LibraryState, match: (g: Game) => boolean): string {
  const rows = games
    .filter((g) => g.recentHours > 0 && match(g))
    .sort((a, b) => playedAt(b) - playedAt(a));
  if (!rows.length) return noMatch(s, "You haven't played in the last two weeks.");
  return `<div class="rows history">${rows
    .map(
      (g) => `
  <button type="button" class="card row" style="${artVars(g.art)}" data-action="hub" data-id="${g.id}">
    <span class="cover cover-sm" aria-hidden="true">${cover(g, false)}</span>
    <span class="row-text"><span class="card-title">${esc(g.title)}</span><span class="muted-sm">${esc(g.genre || (g.installed ? "Installed" : "Not installed"))}</span></span>
    <span class="muted-sm row-date">${g.lastPlayed ? ago(g.lastPlayed) : ""}</span>
    <span class="row-price">${hours(g.recentHours)}</span>
  </button>`,
    )
    .join("")}</div>`;
}
