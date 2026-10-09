import type { Account, Game } from "../api";
import { ago, clock, date, esc, hours } from "../format";
import { artVars, hero, icon } from "../ui";
import { lastPlayed, playButton } from "./home";

export function hubView(g: Game, account: Account): string {
  const tags = [
    g.installed ? `Installed · ${g.sizeGB} GB` : "Not installed",
    g.controller && "Controller supported",
    g.cloudSaves && "Steam Cloud",
  ].filter(Boolean) as string[];

  return `
<div class="hub" style="${artVars(g.art)}">
  <div class="hub-hero">
    <div class="backdrop backdrop-hub" aria-hidden="true">
      <div class="backdrop-orb"></div>
      <div class="backdrop-band"></div>
      <div class="backdrop-ring"></div>
    </div>
    <div class="hero" aria-hidden="true">${hero(g)}</div>
    <div class="hub-hero-body">
      <header class="topbar">
        <button type="button" class="back" data-action="nav" data-to="home">${icon.back()}Games</button>
        <span class="clock" data-clock>${clock()}</span>
      </header>
      <div class="grow"></div>
      <div class="selected">
        ${g.genre ? `<div class="eyebrow">${esc(g.genre)}</div>` : ""}
        <h1 class="display">${esc(g.title)}</h1>
        <div class="chips">${tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
        <div class="actions">
          ${playButton(g)}
          <button type="button" class="round-button" aria-label="More options" aria-haspopup="menu" data-action="more" data-id="${g.id}">${icon.more()}</button>
        </div>
      </div>
    </div>
  </div>

  <div class="hub-content">
    <div class="hub-main" id="hub-details">${hubDetails(g, account)}</div>

    <aside class="hub-aside">
      <section class="card panel">
        <h2 class="panel-title">In the store</h2>
        <div class="paid">
          <div class="muted-sm">Price today</div>
          <div class="paid-line"><span class="paid-value">${esc(g.price.now || "Not sold")}</span>${
            g.price.discount ? `<span class="discount">${g.price.discount}% off</span>` : ""
          }</div>
        </div>
        <dl class="facts">
          ${g.price.before ? `<dt>Before the discount</dt><dd>${esc(g.price.before)}</dd>` : ""}
          ${g.released ? `<dt>Released</dt><dd>${date(g.released)}</dd>` : ""}
          ${g.developer ? `<dt>Developer</dt><dd>${esc(g.developer)}</dd>` : ""}
          ${g.publisher && g.publisher !== g.developer ? `<dt>Publisher</dt><dd>${esc(g.publisher)}</dd>` : ""}
        </dl>
        <button type="button" class="pill-link panel-link" data-action="store-game" data-id="${g.id}">Store page${icon.next()}</button>
      </section>

      <section class="card panel">
        <h2 class="panel-title">Playtime</h2>
        <div class="grid-2 playtime">
          <div><div class="big">${hours(g.hours)}</div><div class="muted-sm">Total</div></div>
          <div><div class="big">${hours(g.recentHours)}</div><div class="muted-sm">Last 2 weeks</div></div>
        </div>
        <div class="muted-sm">${lastPlayed(g)}</div>
      </section>
    </aside>
  </div>
</div>`;
}

/** The hub's sections that Library.details loads. */
export function hubDetails(g: Game, account: Account): string {
  return `
<section class="hub-section">${achievements(g, account)}</section>
<section class="hub-section">
  <h2>News</h2>
  ${
    !g.detailed
      ? `<div class="card empty muted-sm">Loading…</div>`
      : g.news.length
        ? `<div class="grid-2">${g.news
            .map(
              (n) => `
    <button type="button" class="card news" data-action="news" data-url="${esc(n.url)}">
      <span class="news-tag">${esc(n.tag)}</span>
      <span class="news-title">${esc(n.title)}</span>
      <span class="muted-sm">${ago(n.when)}</span>
    </button>`,
            )
            .join("")}</div>`
        : `<div class="card empty muted-sm">No news for ${esc(g.title)}.</div>`
  }
</section>`;
}

function achievements(g: Game, account: Account): string {
  const head = (detail = "") =>
    `<div class="section-head"><h2>Achievements</h2>${detail ? `<span class="muted">${detail}</span>` : ""}</div>`;
  if (!account.connected)
    return `${head()}<div class="card empty connect-card"><span class="muted-sm">Connect your Steam account to see your achievements.</span><button type="button" class="pill-link" data-action="connect">Connect${icon.next()}</button></div>`;
  if (!g.detailed) return `${head()}<div class="card empty muted-sm">Loading…</div>`;
  if (!g.achievementsTotal) return `${head()}<div class="card empty muted-sm">${esc(g.title)} has no achievements.</div>`;
  const pct = Math.round((g.achievementsUnlocked / g.achievementsTotal) * 100);
  return `${head(`${g.achievementsUnlocked} of ${g.achievementsTotal} · ${pct}%`)}
  <div class="meter meter-accent" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Achievements unlocked"><div style="width:${pct}%"></div></div>
  <div class="grid-3">
    ${g.achievements
      .map(
        (a) => `
    <div class="card achievement${a.unlocked ? "" : " achievement-locked"}">
      <div class="badge">${a.unlocked ? icon.trophy() : icon.lock()}</div>
      <div class="card-title">${esc(a.title)}</div>
      <div class="muted-sm">${
        a.unlocked && a.unlockedAt ? `Unlocked ${ago(a.unlockedAt)}` : esc(a.detail ? `Next up · ${a.detail}` : "Next up")
      }</div>
    </div>`,
      )
      .join("")}
  </div>`;
}
