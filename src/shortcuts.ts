import { buttonName } from "./gamepad";

/**
 * The commands, and the keys and controller buttons that run them. A key is
 * written as its modifiers and its name, e.g. "Ctrl+Q", "F11", "ArrowLeft"
 * or "E"; a button as its place on the controller (see gamepad.ts). The user
 * may change the keys and buttons of every command; the changes are saved.
 */

export type Command =
  | "left"
  | "right"
  | "up"
  | "down"
  | "confirm"
  | "back"
  | "options"
  | "prevTab"
  | "nextTab"
  | "games"
  | "library"
  | "store"
  | "search"
  | "installed"
  | "fullscreen"
  | "reload"
  | "settings"
  | "quit";

/** What runs the commands: keys, or the buttons of a game controller. */
export type Device = "keyboard" | "controller";

export interface CommandInfo {
  id: Command;
  label: string;
  group: string;
  keys: readonly string[];
  buttons: readonly string[];
}

export const commands: readonly CommandInfo[] = [
  { id: "left", group: "Navigation", label: "Left · previous game", keys: ["ArrowLeft"], buttons: ["Left"] },
  { id: "right", group: "Navigation", label: "Right · next game", keys: ["ArrowRight"], buttons: ["Right"] },
  { id: "up", group: "Navigation", label: "Up", keys: ["ArrowUp"], buttons: ["Up"] },
  { id: "down", group: "Navigation", label: "Down · game hub", keys: ["ArrowDown"], buttons: ["Down"] },
  { id: "confirm", group: "Navigation", label: "Play or install", keys: ["Enter"], buttons: ["South"] },
  { id: "back", group: "Navigation", label: "Back", keys: ["Escape", "Backspace"], buttons: ["East"] },
  { id: "options", group: "Navigation", label: "Game options", keys: ["O"], buttons: ["West"] },
  { id: "prevTab", group: "Sections", label: "Previous tab", keys: ["Q"], buttons: ["LB"] },
  { id: "nextTab", group: "Sections", label: "Next tab", keys: ["E"], buttons: ["RB"] },
  { id: "games", group: "Sections", label: "Games", keys: ["1"], buttons: [] },
  { id: "library", group: "Sections", label: "Library", keys: ["2"], buttons: [] },
  { id: "store", group: "Sections", label: "Steam store", keys: ["3"], buttons: [] },
  { id: "search", group: "Sections", label: "Search the library", keys: ["/", "Ctrl+F"], buttons: ["North"] },
  { id: "installed", group: "Sections", label: "Installed games", keys: ["I"], buttons: [] },
  { id: "fullscreen", group: "App", label: "Toggle full screen", keys: ["F11"], buttons: ["View"] },
  { id: "reload", group: "App", label: "Reload the library", keys: ["F5", "Ctrl+R"], buttons: [] },
  { id: "settings", group: "App", label: "Settings", keys: ["F1", "Ctrl+,"], buttons: ["Menu"] },
  { id: "quit", group: "App", label: "Quit", keys: ["Ctrl+Q"], buttons: [] },
];

const info = new Map(commands.map((c) => [c.id, c]));

const defaults = (id: Command, device: Device) => (device === "keyboard" ? info.get(id)!.keys : info.get(id)!.buttons);

/** The keys or buttons the user chose, for the commands whose keys or buttons they changed. */
const changed: Record<Device, Partial<Record<Command, string[]>>> = { keyboard: {}, controller: {} };

/** The keys of a command, or its buttons. */
export function keysOf(id: Command, device: Device): readonly string[] {
  return changed[device][id] ?? defaults(id, device);
}

export function isChanged(id: Command, device: Device): boolean {
  return id in changed[device];
}

/** The command a key or a button runs, if any. */
export function commandOf(key: string, device: Device): Command | undefined {
  return commands.find((c) => keysOf(c.id, device).includes(key))?.id;
}

/** The changes to save, by command. */
export function changes(device: Device): Record<string, string[]> {
  return { ...changed[device] };
}

/** Takes in saved changes, leaving out unknown commands. */
export function setChanges(device: Device, saved: Record<string, string[]>) {
  changed[device] = {};
  for (const [id, keys] of Object.entries(saved)) {
    if (info.has(id as Command) && Array.isArray(keys)) setKeys(id as Command, keys.map(String), device);
  }
}

function setKeys(id: Command, keys: string[], device: Device) {
  const d = defaults(id, device);
  if (keys.length === d.length && keys.every((k, i) => k === d[i])) delete changed[device][id];
  else changed[device][id] = keys;
}

/** How many keys or buttons a command can have: one and an alternate. */
export const SLOTS = 2;

/**
 * Sets the key or button in a slot of a command, the first slot free if the
 * slot is past its keys. A key runs one command, so the command that had the
 * key loses it; setKey returns that command.
 */
export function setKey(id: Command, slot: number, key: string, device: Device): Command | undefined {
  const keys = [...keysOf(id, device)];
  const at = keys.indexOf(key);
  if (at >= 0) {
    // The command's other key: the two swap.
    if (slot < keys.length) [keys[at], keys[slot]] = [keys[slot]!, keys[at]!];
    setKeys(id, keys, device);
    return undefined;
  }
  const previous = commandOf(key, device);
  if (previous) removeKey(previous, key, device);
  if (slot < keys.length) keys[slot] = key;
  else keys.push(key);
  setKeys(id, keys.slice(0, SLOTS), device);
  return previous;
}

export function removeKey(id: Command, key: string, device: Device) {
  setKeys(
    id,
    keysOf(id, device).filter((k) => k !== key),
    device,
  );
}

export function resetKeys(device: Device, id?: Command) {
  if (id) delete changed[device][id];
  else changed[device] = {};
}

export function labelOf(id: Command): string {
  return info.get(id)!.label;
}

// ---- The device in use ----

/** What the user last ran a command with; the screen shows its keys or buttons. */
let device: Device = "keyboard";

export const inputDevice = () => device;

/** Makes the screen show the keys or the buttons; false if it already does. */
export function setInputDevice(d: Device): boolean {
  if (d === device) return false;
  device = d;
  return true;
}

// ---- Keys ----

const notKeys = new Set([
  "Control",
  "Shift",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "Super",
  "Hyper",
  "Fn",
  "FnLock",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Dead",
  "Process",
  "Unidentified",
]);

/** The key of a key press, null for a modifier alone or while composing text. */
export function keyOf(e: KeyboardEvent): string | null {
  if (e.isComposing || notKeys.has(e.key)) return null;
  let name = e.key === " " ? "Space" : e.key;
  const char = name.length === 1;
  if (char) name = name.toUpperCase();
  // Shift makes "?" of "/", so it is part of the key, except for letters.
  const shift = e.shiftKey && (!char || name.toLowerCase() !== name);
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", shift && "Shift", e.metaKey && "Meta", name]
    .filter(Boolean)
    .join("+");
}

/** Whether a key, in a text field, types or moves the caret rather than running a command. */
export function typesText(key: string): boolean {
  if (/(^|\+)(Ctrl|Alt|Meta)\+./.test(key)) return false;
  const name = key.replace(/^Shift\+(?=.)/, "");
  return (
    name.length === 1 ||
    ["Space", "Backspace", "Delete", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"].includes(name)
  );
}

const mac = /Mac|iPhone|iPad/.test(navigator.platform);

const names: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Delete: "Del",
  PageUp: "Page Up",
  PageDown: "Page Down",
  Meta: mac ? "Cmd" : "Super",
  Alt: mac ? "Option" : "Alt",
};

/** A key as the screen shows it, e.g. "Ctrl+Q" or "←". */
export function keyName(key: string): string {
  return key
    .split(/\+(?=.)/)
    .map((part) => names[part] ?? part)
    .join("+");
}

/** A key or a button as the screen shows it, e.g. "Ctrl+Q", "←" or "A". */
export function nameOf(key: string, d: Device): string {
  return d === "keyboard" ? keyName(key) : buttonName(key);
}
