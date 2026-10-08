import type { Game } from "../api";
import { date, esc, rupiah } from "../format";
import { artVars, coverShapes } from "../ui";
import { header } from "./header";

export type LibraryTab = "installed" | "collection" | "history";
export type LibrarySort = "newest" | "oldest" | "price" | "played";

export interface LibraryState {
  tab: LibraryTab;
  query: string;
  sort: LibrarySort;
}

const tabs: [LibraryTab, string][] = [
  ["installed", "Installed"],
  ["collection", "Your collection"],
  ["history", "Purchase history"],
];

const sorts: [LibrarySort, string][] = [
  ["newest", "Purchase date — newest"],
  ["oldest", "Purchase date — oldest"],
  ["price", "Price paid — highest"],
  ["played", "Most played"],
];

export function libraryView(games: Game[], s: LibraryState): string {
  const spent = games.reduce((sum, g) => sum + g.pricePaid, 0);
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
    <div class="stat-card stat-card-flat"><div class="caps">Games owned</div><div class="stat-big">${games.length}</div></div>
    <div class="stat-card stat-card-flat"><div class="caps">Total spent</div><div class="stat-big">${rupiah(spent)}</div></div>
    <div class="stat-card stat-card-flat"><div class="caps">Average per game</div><div class="stat-big">${rupiah(spent / games.length)}</div></div>
  </div>
  <div class="list-head">
    <h1 class="list-title">${tabs.find(([id]) => id === s.tab)![1]}</h1>
    <div class="controls">
      <div class="control">
        <label for="lib-search">Search</label>
        <input id="lib-search" type="search" placeholder="Game title" autocomplete="off" value="${esc(s.query)}" />
      </div>
      ${
        s.tab === "history"
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
  const match = (title: string) => !q || title.toLowerCase().includes(q);
  return s.tab === "history" ? history(games, s, match) : grid(games, s, match);
}

function grid(games: Game[], s: LibraryState, match: (t: string) => boolean): string {
  const by: Record<LibrarySort, (a: Game, b: Game) => number> = {
    newest: (a, b) => b.purchasedOn.localeCompare(a.purchasedOn),
    oldest: (a, b) => a.purchasedOn.localeCompare(b.purchasedOn),
    price: (a, b) => b.pricePaid - a.pricePaid,
    played: (a, b) => b.hours - a.hours,
  };
  const shown = games
    .filter((g) => (s.tab !== "installed" || g.installed) && match(g.title))
    .sort(by[s.sort]);
  if (!shown.length) return `<p class="empty-state">No games match “${esc(s.query.trim())}”.</p>`;
  return `<div class="lib-grid">${shown
    .map(
      (g) => `
  <button type="button" class="lib-card" data-action="open" data-id="${g.id}">
    <span class="cover" style="${artVars(g.art)}" aria-hidden="true">${coverShapes(g.title)}</span>
    <span class="lib-card-title">${esc(g.title)}</span>
    <span class="lib-card-meta"><span>${s.tab === "installed" ? `${g.sizeGB} GB` : date(g.purchasedOn)}</span><b>${rupiah(g.pricePaid)}</b></span>
  </button>`,
    )
    .join("")}</div>`;
}

function history(games: Game[], s: LibraryState, match: (t: string) => boolean): string {
  const rows = games
    .flatMap((g) => [
      { game: g, title: g.title, kind: g.genre, on: g.purchasedOn, price: g.pricePaid, addOn: false },
      ...g.addOns.map((a) => ({
        game: g,
        title: a.title,
        kind: `Add-on · ${g.title}`,
        on: a.boughtOn,
        price: a.price,
        addOn: true,
      })),
    ])
    .filter((r) => match(r.title) || match(r.game.title))
    .sort((a, b) => b.on.localeCompare(a.on));
  if (!rows.length) return `<p class="empty-state">No purchases match “${esc(s.query.trim())}”.</p>`;
  return `<div class="rows history">${rows
    .map(
      (r) => `
  <button type="button" class="card row" style="${artVars(r.game.art)}" data-action="hub" data-id="${r.game.id}">
    <span class="cover cover-sm" aria-hidden="true">${coverShapes()}</span>
    <span class="row-text"><span class="card-title">${esc(r.title)}</span><span class="muted-sm">${esc(r.kind)}</span></span>
    <span class="muted-sm row-date">${date(r.on)}</span>
    <span class="row-price">${rupiah(r.price)}</span>
  </button>`,
    )
    .join("")}</div>`;
}
