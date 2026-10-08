import type { Account } from "../api";
import { clock, esc } from "../format";
import { icon } from "../ui";

/** Connecting a Steam account with a Web API key, which is optional. */
export function connectView(account: Account, error = ""): string {
  return `
<div class="screen">
  <header class="topbar">
    <button type="button" class="back" data-action="nav" data-to="home">${icon.back()}Games</button>
    <span class="clock" data-clock>${clock()}</span>
  </header>
  <form class="connect" id="connect-form">
    <h1 class="list-title">Connect your Steam account</h1>
    <p class="blurb">Your installed games play without it. With a Steam Web API key, the library also shows
    the games you own but never played on this computer, and your achievements.</p>
    <div class="control">
      <label for="connect-key">Web API key</label>
      <input id="connect-key" name="key" type="password" autocomplete="off" spellcheck="false" required />
    </div>
    <button type="button" class="stat-link" data-action="key-page">Get a key on steamcommunity.com${icon.next()}</button>
    <div class="control">
      <label for="connect-account">Steam account</label>
      <input id="connect-account" name="account" autocomplete="off" spellcheck="false" placeholder="SteamID64, profile URL or custom URL name" value="${esc(account.steamID)}" />
    </div>
    <p class="muted-sm">Your profile's game details must be public. The key is kept on this computer only.</p>
    ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ""}
    <div class="actions">
      <button type="submit" class="play">Connect</button>
    </div>
  </form>
</div>`;
}

/** A full screen message, such as while the library loads. */
export function messageView(title: string, text = "", actions = ""): string {
  return `
<div class="screen screen-center">
  <div class="message">
    <h1 class="list-title">${esc(title)}</h1>
    ${text ? `<p class="blurb">${esc(text)}</p>` : ""}
    ${actions ? `<div class="actions">${actions}</div>` : ""}
  </div>
</div>`;
}
