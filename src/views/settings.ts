import type { Account } from "../api";
import { clock, esc } from "../format";
import { commands, isChanged, keysOf, nameOf, SLOTS, type Command, type Device } from "../shortcuts";
import { badge, hint, icon, keyHint, shortcut } from "../ui";
import { avatar } from "./header";

export type SettingsTab = "general" | "account" | "keyboard" | "controller";

export interface SettingsState {
  tab: SettingsTab;
  account: Account;
  fullScreen: boolean;
  startFullScreen: boolean;
  /** The key or button slot waiting for a key or button press, if any. */
  recording: { id: Command; slot: number; device: Device } | null;
  /** The names of the controllers connected. */
  controllers: string[];
}

const tabs: [SettingsTab, string, () => string][] = [
  ["general", "General", icon.display],
  ["account", "Steam account", icon.user],
  ["keyboard", "Keyboard", icon.keyboard],
  ["controller", "Controller", icon.controller],
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
      <button type="button" class="settings-tab settings-quit" data-action="quit">${icon.power()}Quit${shortcut("quit")}</button>
    </nav>
    <section class="settings-pane" aria-label="${esc(tabs.find(([id]) => id === s.tab)![1])}">
      ${
        s.tab === "general"
          ? general(s)
          : s.tab === "account"
            ? accountPane(s.account)
            : s.tab === "keyboard"
              ? keyboard(s)
              : controller(s)
      }
    </section>
  </div>
  <footer class="hints">${settingsHints(s)}</footer>
</div>`;
}

/** "Or press F11", or "" when the command has no key. */
function orPress(id: Command): string {
  const key = shortcut(id);
  return key ? ` Or press ${key}.` : "";
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
  return `
<div class="pane-head">
  <div>
    <h2 class="pane-title">Keyboard</h2>
    <p class="setting-detail">Select a key to change it, then press the new key.</p>
  </div>
  <button type="button" class="setting-button" data-action="keys-reset-all" data-device="keyboard">Restore defaults</button>
</div>
${keymap(s, "keyboard")}`;
}

function controller(s: SettingsState): string {
  const status = s.controllers.length
    ? `<span class="setting-label">${esc(s.controllers.join(", "))}</span>
      <span class="setting-detail">The left stick moves too, and the right stick scrolls.</span>`
    : `<span class="setting-label">No controller found</span>
      <span class="setting-detail">Connect one and press any of its buttons.</span>`;
  return `
<div class="pane-head">
  <div>
    <h2 class="pane-title">Controller</h2>
    <p class="setting-detail">Select a button to change it, then press the new button.</p>
  </div>
  <button type="button" class="setting-button" data-action="keys-reset-all" data-device="controller">Restore defaults</button>
</div>
<div class="setting-list"><div class="setting pad-setting">${icon.controller()}<div class="setting-text">${status}</div></div></div>
${keymap(s, "controller")}`;
}

function keymap(s: SettingsState, device: Device): string {
  const groups = [...new Set(commands.map((c) => c.group))];
  const what = device === "keyboard" ? "Key" : "Button";
  return `
<div class="keymap" role="table" aria-label="${device === "keyboard" ? "Keyboard shortcuts" : "Controller buttons"}">
  <div class="keymap-row keymap-head" role="row">
    <span role="columnheader">Action</span><span role="columnheader">${what}</span><span role="columnheader">Alternate</span><span></span>
  </div>
  ${groups
    .map(
      (group) => `
  <div class="keymap-group" role="row"><span role="rowheader">${esc(group)}</span></div>
  ${commands
    .filter((c) => c.group === group)
    .map((c) => keyRow(c.id, c.label, device, s.recording?.id === c.id && s.recording.device === device ? s.recording.slot : -1))
    .join("")}`,
    )
    .join("")}
</div>`;
}

function keyRow(id: Command, label: string, device: Device, recordingSlot: number): string {
  const keys = keysOf(id, device);
  const thing = device === "keyboard" ? "key" : "button";
  const slots = Array.from({ length: SLOTS }, (_, slot) => {
    const key = keys[slot];
    const listening = slot === recordingSlot;
    const name = key ? nameOf(key, device) : "";
    const which = slot === 0 ? thing : `alternate ${thing}`;
    return `<span role="cell"><button type="button" class="key-slot${listening ? " key-listening" : ""}${key ? "" : " key-empty"}" data-action="key-slot" data-device="${device}" data-command="${id}" data-slot="${slot}" aria-label="${
      listening ? `Press the new ${which} for ${esc(label)}` : `${esc(label)}, ${which}: ${name ? esc(name) : "none"}. Change`
    }">${listening ? `Press a ${thing}…` : key ? badge(key, device) : "Add"}</button></span>`;
  }).join("");
  return `
<div class="keymap-row" role="row">
  <span class="keymap-label" role="rowheader">${esc(label)}</span>
  ${slots}
  <span role="cell">${
    isChanged(id, device)
      ? `<button type="button" class="icon-button key-reset" aria-label="Restore the ${thing}s of ${esc(label)}" title="Restore default" data-action="key-reset" data-device="${device}" data-command="${id}">${icon.reset()}</button>`
      : ""
  }</span>
</div>`;
}

function settingsHints(s: SettingsState): string {
  if (s.recording?.device === "controller")
    return `<span class="hint">Press the same button to keep it</span>` + hint("Esc", "Cancel") + hint("Delete", "Clear the button");
  if (s.recording) return hint("Esc", "Cancel") + hint("Delete", "Clear the key");
  return keyHint(["up", "down"], "Move") + keyHint(["confirm"], "Select") + keyHint(["back"], "Back");
}
