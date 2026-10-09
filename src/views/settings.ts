import type { Account } from "../api";
import { clock, esc } from "../format";
import { commands, isChanged, keyName, keysOf, type Command } from "../shortcuts";
import { icon } from "../ui";

/** The settings: full screen, the Steam account, quitting, and the keyboard shortcuts. */
export function settingsView(account: Account, recording?: Command): string {
  const groups = [...new Set(commands.map((c) => c.group))];
  return `
<div class="screen">
  <header class="topbar">
    <button type="button" class="back" data-action="nav" data-to="home">${icon.back()}Games</button>
    <span class="clock" data-clock>${clock()}</span>
  </header>
  <div class="settings">
    <h1 class="list-title">Settings</h1>
    <section class="settings-group" aria-labelledby="settings-general">
      <h2 class="caps" id="settings-general">General</h2>
      ${settingRow(
        "Full screen",
        "Fill the screen with the app.",
        "fullscreen",
        `<button type="button" class="key-button" data-action="fullscreen">Toggle full screen</button>`,
      )}
      ${settingRow(
        "Steam account",
        account.connected
          ? `Connected as ${account.name || account.steamID}.`
          : "Not connected. Your installed games play without it.",
        undefined,
        account.connected
          ? `<button type="button" class="key-button" data-action="disconnect">Disconnect</button>`
          : `<button type="button" class="key-button" data-action="connect">Connect</button>`,
      )}
      ${settingRow(
        "Quit",
        "Close Steam Library and its store window.",
        "quit",
        `<button type="button" class="key-button key-danger" data-action="quit">Quit</button>`,
      )}
    </section>
    <section class="settings-group" aria-labelledby="settings-keys">
      <div class="list-head">
        <div class="keys-intro">
          <h2 class="caps" id="settings-keys">Keyboard shortcuts</h2>
          <p class="muted-sm">Choose Add, then press the new key, or Esc to cancel. A key runs one command:
          giving it to another command moves it there.</p>
        </div>
        <button type="button" class="key-button" data-action="keys-reset-all">Reset all</button>
      </div>
      ${groups
        .map(
          (group) => `
      <div class="key-group" role="group" aria-label="${esc(group)}">
        <h3 class="key-group-title">${esc(group)}</h3>
        ${commands
          .filter((c) => c.group === group)
          .map((c) => keyRow(c.id, c.label, c.id === recording))
          .join("")}
      </div>`,
        )
        .join("")}
    </section>
  </div>
</div>`;
}

/** A setting, with the keys of its command if it has one. */
function settingRow(label: string, detail: string, command: Command | undefined, button: string): string {
  const keys = command ? keysOf(command) : [];
  return `
<div class="key-row setting-row">
  <span class="setting-text"><span class="key-label">${esc(label)}</span><span class="muted-sm">${esc(detail)}</span></span>
  <span class="key-chips">${keys.map((k) => `<kbd>${esc(keyName(k))}</kbd>`).join("")}</span>
  <span class="key-tools">${button}</span>
</div>`;
}

function keyRow(id: Command, label: string, recording: boolean): string {
  const keys = keysOf(id);
  return `
<div class="key-row">
  <span class="key-label">${esc(label)}</span>
  <span class="key-chips">${
    keys.length
      ? keys
          .map(
            (k) =>
              `<button type="button" class="key-chip" aria-label="Remove ${esc(keyName(k))} from ${esc(label)}" data-action="key-remove" data-command="${id}" data-key="${esc(k)}"><kbd>${esc(keyName(k))}</kbd><span aria-hidden="true">×</span></button>`,
          )
          .join("")
      : `<span class="key-none">No key</span>`
  }</span>
  <span class="key-tools">
    ${isChanged(id) ? `<button type="button" class="key-button" data-action="key-reset" data-command="${id}">Reset</button>` : ""}
    <button type="button" class="key-button${recording ? " key-recording" : ""}" aria-label="${recording ? "Press a key" : `Add a key to ${esc(label)}`}" data-action="key-add" data-command="${id}">${recording ? "Press a key…" : "Add"}</button>
  </span>
</div>`;
}
