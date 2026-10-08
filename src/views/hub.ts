import type { Game } from "../api";
import { ago, clock, date, esc, hours, rupiah } from "../format";
import { artVars, icon } from "../ui";
import { playButton } from "./home";

export function hubView(g: Game): string {
  const pct = Math.round((g.achievementsUnlocked / g.achievementsTotal) * 100);
  const addOnsTotal = g.addOns.reduce((sum, a) => sum + a.price, 0);
  const total = g.pricePaid + addOnsTotal;
  const discount =
    g.storePriceThen > g.pricePaid ? Math.round((1 - g.pricePaid / g.storePriceThen) * 100) : 0;
  const tags = [
    g.installed ? `Installed · ${g.sizeGB} GB` : `Not installed · ${g.sizeGB} GB`,
    g.controller && "Controller supported",
    g.cloudSaves && "Cloud saves on",
  ].filter(Boolean) as string[];

  return `
<div class="hub" style="${artVars(g.art)}">
  <div class="hub-hero">
    <div class="backdrop backdrop-hub" aria-hidden="true">
      <div class="backdrop-orb"></div>
      <div class="backdrop-band"></div>
      <div class="backdrop-ring"></div>
    </div>
    <div class="hub-hero-body">
      <header class="topbar">
        <button type="button" class="back" data-action="nav" data-to="home">${icon.back()}Games</button>
        <span class="clock" data-clock>${clock()}</span>
      </header>
      <div class="grow"></div>
      <div class="selected">
        <div class="eyebrow">${esc(g.genre)}</div>
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
    <div class="hub-main">
      <section class="hub-section">
        <div class="section-head">
          <h2>Achievements</h2>
          <span class="muted">${g.achievementsUnlocked} of ${g.achievementsTotal} · ${pct}%</span>
        </div>
        <div class="meter meter-accent" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Achievements unlocked"><div style="width:${pct}%"></div></div>
        <div class="grid-3">
          ${g.achievements
            .map(
              (a) => `
          <div class="card achievement${a.unlocked ? "" : " achievement-locked"}">
            <div class="badge">${a.unlocked ? icon.trophy() : icon.lock()}</div>
            <div class="card-title">${esc(a.title)}</div>
            <div class="muted-sm">${esc(a.detail)}</div>
          </div>`,
            )
            .join("")}
        </div>
      </section>

      <section class="hub-section">
        <h2>Owned add-ons</h2>
        ${
          g.addOns.length
            ? `<div class="rows">${g.addOns
                .map(
                  (a) => `
          <div class="card row">
            <div class="thumb thumb-${a.art === "band" ? "band" : "orb"}" aria-hidden="true"><span></span></div>
            <div class="row-text"><div class="card-title">${esc(a.title)}</div><div class="muted-sm">Bought ${date(a.boughtOn)}${a.note ? ` · ${esc(a.note)}` : ""}</div></div>
            <div class="row-price">${rupiah(a.price)}</div>
          </div>`,
                )
                .join("")}</div>`
            : `<div class="card empty muted-sm">You don't own any add-ons for ${esc(g.title)}.</div>`
        }
      </section>

      <section class="hub-section">
        <h2>News</h2>
        <div class="grid-2">
          ${g.news
            .map(
              (n) => `
          <article class="card news">
            <span class="news-tag">${esc(n.tag)}</span>
            <span class="news-title">${esc(n.title)}</span>
            <span class="muted-sm">${esc(n.when)}</span>
          </article>`,
            )
            .join("")}
        </div>
      </section>
    </div>

    <aside class="hub-aside">
      <section class="card panel">
        <h2 class="panel-title">Your purchase</h2>
        <div class="paid">
          <div class="muted-sm">Paid</div>
          <div class="paid-line"><span class="paid-value">${rupiah(g.pricePaid)}</span>${
            discount ? `<span class="discount">${discount}% off</span>` : ""
          }</div>
        </div>
        <dl class="facts">
          <dt>Bought on</dt><dd>${date(g.purchasedOn)}</dd>
          <dt>Store price then</dt><dd>${rupiah(g.storePriceThen)}</dd>
          <dt>Store price now</dt><dd>${rupiah(g.storePriceNow)}</dd>
          <dt>Add-ons</dt><dd>${addOnsTotal ? rupiah(addOnsTotal) : "None"}</dd>
        </dl>
        <div class="rule"></div>
        <div class="total"><span class="muted">Total spent on this game</span><span class="total-value">${rupiah(total)}</span></div>
        <div class="total"><span class="muted">Cost per hour played</span><span class="total-value">${
          g.hours ? rupiah(total / g.hours) : "—"
        }</span></div>
      </section>

      <section class="card panel">
        <h2 class="panel-title">Playtime</h2>
        <div class="grid-2 playtime">
          <div><div class="big">${hours(g.hours)}</div><div class="muted-sm">Total</div></div>
          <div><div class="big">${hours(g.recentHours)}</div><div class="muted-sm">Last 2 weeks</div></div>
        </div>
        <div class="muted-sm">First played ${date(g.firstPlayed)} · last played ${ago(g.lastPlayed)}</div>
      </section>
    </aside>
  </div>
</div>`;
}
