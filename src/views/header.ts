import type { Account } from "../api";
import { clock, esc } from "../format";
import { icon } from "../ui";

/** The console header: the section tabs, and with an account the tools. */
export function header(current: "home" | "library", account?: Account): string {
  const tab = (to: string, label: string, on: boolean) =>
    `<button type="button" class="tab${on ? " tab-on" : ""}" ${on ? `aria-current="page"` : ""} data-action="nav" data-to="${to}">${label}</button>`;
  return `
<header class="topbar">
  <nav class="tabs" aria-label="Sections">
    ${tab("home", "Games", current === "home")}
    ${tab("library", "Library", current === "library")}
    <button type="button" class="tab" data-action="store">Store</button>
  </nav>
  <div class="tools">
    ${
      account
        ? `<button type="button" class="icon-button" aria-label="Search" data-action="search">${icon.search()}</button>
    <button type="button" class="icon-button" aria-label="Installed games" data-action="downloads">${icon.download()}</button>
    <button type="button" class="icon-button" aria-label="Settings" data-action="settings">${icon.settings()}</button>
    ${avatar(account)}`
        : ""
    }
    <span class="clock" data-clock>${clock()}</span>
  </div>
</header>`;
}

function avatar(a: Account): string {
  const name = a.name || "Steam";
  return `<span class="avatar" role="img" aria-label="Profile: ${esc(name)}">${
    a.avatar ? `<img src="${esc(a.avatar)}" alt="" onerror="this.remove()">` : ""
  }${esc(name[0]!.toUpperCase())}</span>`;
}
