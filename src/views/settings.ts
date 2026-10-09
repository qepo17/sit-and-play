import type { Account } from "../api";
import { clock, esc } from "../format";
import { commands, isChanged, keyName, keysOf, shortcutOf, SLOTS, type Command } from "../shortcuts";
import { hint, icon } from "../ui";
import { avatar } from "./header";

export type SettingsTab = "general" | "account" | "keyboard";

export interface SettingsState {
  tab: SettingsTab;
  account: Account;
  fullScreen: boolean;
  startFullScreen: boolean;
  /** The key slot waiting for a key press, if any. */
  recording: { id: Command; slot: number } | null;
}

const tabs: [SettingsTab, string, () => string][] = [
  ["general", "General", icon.display],
  ["account", "Steam account", icon.user],
  ["keyboard", "Keyboard", icon.keyboard],
];

/** The settings: a sidebar of sections, the section chosen, and Quit. */
export function settingsView(s: SettingsState): string {
  return `
<div class="screen">
  <header class="topbar">
    <button type="button" class="back" data-action="nav" data-to="home">${icon.back()}Games</button>
    <span class="clock" data-clock>${clock()}</span>
  </header>
  <div class="settings">
    <nav class="settings-nav" aria-label="Settings">
      <h1 class="list-title">Settings</h1>
      ${tabs
        .map(
          ([id, label, glyph]) =>
            `<button type="button" class="settings-tab" data-action="settings-tab" data-settings-tab="${id}"${
              s.tab === id ? ` aria-current="page"` : ""
            }>${glyph()}${label}</button>`,
        )
        .join("")}
      <div class="grow"></div>
      <button type="button" class="settings-tab settings-quit" data-action="quit">${icon.power()}Quit${keyBadge("quit")}</button>
    </nav>
    <section class="settings-pane" aria-label="${esc(tabs.find(([id]) => id === s.tab)![1])}">
      ${s.tab === "general" ? general(s) : s.tab === "account" ? accountPane(s.account) : keyboard(s)}
    </section>
  </div>
  <footer class="hints">${settingsHints(s)}</footer>
</div>`;
}

function keyBadge(id: Command): string {
  const key = shortcutOf(id);
  return key ? `<kbd>${esc(key)}</kbd>` : "";
}

/** "Or press F11", or "" when the command has no key. */
function orPress(id: Command): string {
  const key = shortcutOf(id);
  return key ? ` Or press <kbd>${esc(key)}</kbd>.` : "";
}

function general(s: SettingsState): string {
  return `
<h2 class="pane-title">General</h2>
<div class="setting-list">
  <div class="setting">
    <div class="setting-text">
      <span class="setting-label" id="fullscreen-label">Full screen</span>
      <span class="setting-detail">Fill the whole screen with the app.${orPress("fullscreen")}</span>
    </div>
    <button type="button" class="switch" role="switch" aria-checked="${s.fullScreen}" aria-labelledby="fullscreen-label" data-action="fullscreen"><span class="switch-knob"></span></button>
  </div>
  <div class="setting">
    <div class="setting-text">
      <span class="setting-label" id="start-fullscreen-label">Start in full screen</span>
      <span class="setting-detail">Open the app in full screen every time. When off, it opens in a window.</span>
    </div>
    <button type="button" class="switch" role="switch" aria-checked="${s.startFullScreen}" aria-labelledby="start-fullscreen-label" data-action="start-fullscreen"><span class="switch-knob"></span></button>
  </div>
  <div class="setting">
    <div class="setting-text">
      <span class="setting-label">Reload the library</span>
      <span class="setting-detail">Read your games from Steam again.${orPress("reload")}</span>
    </div>
    <button type="button" class="setting-button" data-action="reload">Reload</button>
  </div>
</div>`;
}

function accountPane(a: Account): string {
  const status = a.connected
    ? "Connected with a Steam Web API key. The library shows every game you own, and your achievements."
    : a.client
      ? "Using the account signed in to Steam on this computer. Connect it to also see the games you own but never installed here, and your achievements."
      : "Steam isn't installed on this computer. Connect your account to browse your games.";
  return `
<h2 class="pane-title">Steam account</h2>
<div class="account-card">
  ${avatar(a)}
  <div class="setting-text">
    <span class="setting-label">${esc(a.name || "Not signed in")}</span>
    <span class="setting-detail">${esc(status)}</span>
  </div>
  ${
    a.connected
      ? `<button type="button" class="setting-button" data-action="disconnect">Disconnect</button>`
      : `<button type="button" class="setting-button setting-button-primary" data-action="connect">Connect</button>`
  }
</div>`;
}

function keyboard(s: SettingsState): string {
  const groups = [...new Set(commands.map((c) => c.group))];
  return `
<div class="pane-head">
  <div>
    <h2 class="pane-title">Keyboard</h2>
    <p class="setting-detail">Select a key to change it, then press the new key.</p>
  </div>
  <button type="button" class="setting-button" data-action="keys-reset-all">Restore defaults</button>
</div>
<div class="keymap" role="table" aria-label="Keyboard shortcuts">
  <div class="keymap-row keymap-head" role="row">
    <span role="columnheader">Action</span><span role="columnheader">Key</span><span role="columnheader">Alternate</span><span></span>
  </div>
  ${groups
    .map(
      (group) => `
  <div class="keymap-group" role="row"><span role="rowheader">${esc(group)}</span></div>
  ${commands
    .filter((c) => c.group === group)
    .map((c) => keyRow(c.id, c.label, s.recording?.id === c.id ? s.recording.slot : -1))
    .join("")}`,
    )
    .join("")}
</div>`;
}

function keyRow(id: Command, label: string, recordingSlot: number): string {
  const keys = keysOf(id);
  const slots = Array.from({ length: SLOTS }, (_, slot) => {
    const key = keys[slot];
    const listening = slot === recordingSlot;
    const name = key ? keyName(key) : "";
    const which = slot === 0 ? "key" : "alternate key";
    return `<span role="cell"><button type="button" class="key-slot${listening ? " key-listening" : ""}${key ? "" : " key-empty"}" data-action="key-slot" data-command="${id}" data-slot="${slot}" aria-label="${
      listening ? `Press the new ${which} for ${esc(label)}` : `${esc(label)}, ${which}: ${name ? esc(name) : "none"}. Change`
    }">${listening ? "Press a key…" : key ? `<kbd>${esc(name)}</kbd>` : "Add"}</button></span>`;
  }).join("");
  return `
<div class="keymap-row" role="row">
  <span class="keymap-label" role="rowheader">${esc(label)}</span>
  ${slots}
  <span role="cell">${
    isChanged(id)
      ? `<button type="button" class="icon-button key-reset" aria-label="Restore the keys of ${esc(label)}" title="Restore default" data-action="key-reset" data-command="${id}">${icon.reset()}</button>`
      : ""
  }</span>
</div>`;
}

function settingsHints(s: SettingsState): string {
  if (s.recording) return hint("Esc", "Cancel") + hint("Delete", "Clear the key");
  const keys = (ids: Command[]) => ids.map(shortcutOf);
  const h = (ids: Command[], label: string) => {
    const k = keys(ids);
    return k.every(Boolean) ? hint(k.join("  "), label) : "";
  };
  return h(["up", "down"], "Move") + h(["confirm"], "Select") + h(["back"], "Back");
}
