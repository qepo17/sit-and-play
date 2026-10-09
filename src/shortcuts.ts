/**
 * The keyboard commands, and the keys that run them. A key is written as
 * its modifiers and its name, e.g. "Ctrl+Q", "F11", "ArrowLeft" or "E".
 * The user may change the keys of every command; the changes are saved.
 */

export type Command =
  | "left"
  | "right"
  | "up"
  | "down"
  | "confirm"
  | "back"
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

export interface CommandInfo {
  id: Command;
  label: string;
  group: string;
  keys: readonly string[];
}

export const commands: readonly CommandInfo[] = [
  { id: "left", group: "Navigation", label: "Left · previous game", keys: ["ArrowLeft"] },
  { id: "right", group: "Navigation", label: "Right · next game", keys: ["ArrowRight"] },
  { id: "up", group: "Navigation", label: "Up", keys: ["ArrowUp"] },
  { id: "down", group: "Navigation", label: "Down · game hub", keys: ["ArrowDown"] },
  { id: "confirm", group: "Navigation", label: "Play or install", keys: ["Enter"] },
  { id: "back", group: "Navigation", label: "Back", keys: ["Escape", "Backspace"] },
  { id: "prevTab", group: "Sections", label: "Previous tab", keys: ["Q"] },
  { id: "nextTab", group: "Sections", label: "Next tab", keys: ["E"] },
  { id: "games", group: "Sections", label: "Games", keys: ["1"] },
  { id: "library", group: "Sections", label: "Library", keys: ["2"] },
  { id: "store", group: "Sections", label: "Steam store", keys: ["3"] },
  { id: "search", group: "Sections", label: "Search the library", keys: ["/", "Ctrl+F"] },
  { id: "installed", group: "Sections", label: "Installed games", keys: ["I"] },
  { id: "fullscreen", group: "App", label: "Toggle full screen", keys: ["F11"] },
  { id: "reload", group: "App", label: "Reload the library", keys: ["F5", "Ctrl+R"] },
  { id: "settings", group: "App", label: "Settings", keys: ["F1", "Ctrl+,"] },
  { id: "quit", group: "App", label: "Quit", keys: ["Ctrl+Q"] },
];

const info = new Map(commands.map((c) => [c.id, c]));

/** The keys the user chose, for the commands whose keys they changed. */
let changed: Partial<Record<Command, string[]>> = {};

export function keysOf(id: Command): readonly string[] {
  return changed[id] ?? info.get(id)!.keys;
}

export function isChanged(id: Command): boolean {
  return id in changed;
}

/** The command a key runs, if any. */
export function commandOf(key: string): Command | undefined {
  return commands.find((c) => keysOf(c.id).includes(key))?.id;
}

/** The changes to save, by command. */
export function changes(): Record<string, string[]> {
  return { ...changed };
}

/** Takes in saved changes, leaving out unknown commands. */
export function setChanges(saved: Record<string, string[]>) {
  changed = {};
  for (const [id, keys] of Object.entries(saved)) {
    if (info.has(id as Command) && Array.isArray(keys)) setKeys(id as Command, keys.map(String));
  }
}

function setKeys(id: Command, keys: string[]) {
  const defaults = info.get(id)!.keys;
  if (keys.length === defaults.length && keys.every((k, i) => k === defaults[i])) delete changed[id];
  else changed[id] = keys;
}

/** How many keys a command can have: a key and an alternate. */
export const SLOTS = 2;

/**
 * Sets the key in a slot of a command, the first slot free if the slot is
 * past its keys. A key runs one command, so the command that had the key
 * loses it; setKey returns that command.
 */
export function setKey(id: Command, slot: number, key: string): Command | undefined {
  const keys = [...keysOf(id)];
  const at = keys.indexOf(key);
  if (at >= 0) {
    // The command's other key: the two swap.
    if (slot < keys.length) [keys[at], keys[slot]] = [keys[slot]!, keys[at]!];
    setKeys(id, keys);
    return undefined;
  }
  const previous = commandOf(key);
  if (previous) removeKey(previous, key);
  if (slot < keys.length) keys[slot] = key;
  else keys.push(key);
  setKeys(id, keys.slice(0, SLOTS));
  return previous;
}

export function removeKey(id: Command, key: string) {
  setKeys(
    id,
    keysOf(id).filter((k) => k !== key),
  );
}

export function resetKeys(id?: Command) {
  if (id) delete changed[id];
  else changed = {};
}

export function labelOf(id: Command): string {
  return info.get(id)!.label;
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

/** How the screen shows the first key of a command, "" if it has none. */
export function shortcutOf(id: Command): string {
  const key = keysOf(id)[0];
  return key ? keyName(key) : "";
}
