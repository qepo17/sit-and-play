import { clock, esc } from "../format";
import { commands, isChanged, keyName, keysOf, type Command } from "../shortcuts";
import { icon } from "../ui";

/** The keyboard commands and their keys, which the user may change. */
export function shortcutsView(recording?: Command): string {
  const groups = [...new Set(commands.map((c) => c.group))];
  return `
<div class="screen">
  <header class="topbar">
    <button type="button" class="back" data-action="nav" data-to="home">${icon.back()}Games</button>
    <span class="clock" data-clock>${clock()}</span>
  </header>
  <div class="keys">
    <div class="list-head">
      <div class="keys-intro">
        <h1 class="list-title">Keyboard shortcuts</h1>
        <p class="muted-sm">Choose Add, then press the new key, or Esc to cancel. A key runs one command:
        giving it to another command moves it there.</p>
      </div>
      <button type="button" class="pill-link" data-action="keys-reset-all">Reset all</button>
    </div>
    ${groups
      .map(
        (group) => `
    <section class="key-group" aria-label="${esc(group)}">
      <h2 class="caps">${esc(group)}</h2>
      ${commands
        .filter((c) => c.group === group)
        .map((c) => keyRow(c.id, c.label, c.id === recording))
        .join("")}
    </section>`,
      )
      .join("")}
  </div>
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
