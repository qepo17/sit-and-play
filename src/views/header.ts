import { clock } from "../format";
import { icon } from "../ui";

/** The console header: the section tabs, and on the home screen its tools. */
export function header(current: "home" | "library", tools = false): string {
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
      tools
        ? `<button type="button" class="icon-button" aria-label="Search" data-action="search">${icon.search()}</button>
    <button type="button" class="icon-button" aria-label="Downloads" data-action="downloads">${icon.download()}</button>
    <button type="button" class="icon-button" aria-label="Settings" aria-haspopup="menu" data-action="settings">${icon.settings()}</button>
    <span class="avatar" role="img" aria-label="Profile: Qepo">Q</span>`
        : ""
    }
    <span class="clock" data-clock>${clock()}</span>
  </div>
</header>`;
}
