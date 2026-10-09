import "./style.css";
import { currentWindow, isMyGo } from "mygo-runtime";
import { App, Library, Store, type Account, type Game } from "./api";
import { clock } from "./format";
import { controllers, startGamepads, type Button, type Direction } from "./gamepad";
import {
  changes,
  commandOf,
  keyOf,
  keysOf,
  labelOf,
  nameOf,
  removeKey,
  resetKeys,
  setChanges,
  setInputDevice,
  setKey,
  typesText,
  type Command,
  type Device,
} from "./shortcuts";
import { artVars, hero } from "./ui";
import { connectView, messageView } from "./views/connect";
import { gameRow, hints, homeView, selectedGame, stats } from "./views/home";
import { hubDetails, hubView } from "./views/hub";
import { libraryResults, libraryView, type LibraryState, type LibraryTab, type LibrarySort } from "./views/library";
import { settingsView, type SettingsTab } from "./views/settings";

type Route = "home" | "hub" | "library" | "connect" | "settings";

/** How many of the most recently played installed games the home row shows. */
const ROW = 15;

const app = document.querySelector<HTMLElement>("#app")!;

let account: Account = { connected: false, steamID: "", name: "", avatar: "", client: false };
let games: Game[] = [];
let selectedId = "";
let route: Route = "home";
const lib: LibraryState = { tab: "installed", query: "", sort: "recent" };

const selected = () => games.find((g) => g.id === selectedId) ?? games[0]!;

/** Whether the screen shows games, rather than a message when there are none. */
const showsGames = () => route === "home" || route === "hub" || route === "library";

/** The home row: the latest installed games played, and the selected one. */
function homeGames(): Game[] {
  const row = games.filter((g) => g.installed).slice(0, ROW);
  const g = selected();
  return !g.installed || row.includes(g) ? row : [g, ...row.slice(0, ROW - 1)];
}

/** Moves the selection to an installed game, as the home screen shows only those. */
function selectInstalled() {
  if (selected().installed) return;
  const g = games.find((g) => g.installed);
  if (!g) return;
  selectedId = g.id;
  Library.select(g.id).catch(showError);
}

function replaceGame(g: Game) {
  games = games.map((old) => (old.id === g.id ? g : old));
}

async function boot() {
  closeMenu();
  app.innerHTML = messageView("Loading your Steam library…");
  try {
    let shortcuts: Record<string, string[]>;
    let buttons: Record<string, string[]>;
    [account, games, selectedId, shortcuts, buttons, startFullScreen] = await Promise.all([
      Library.account(),
      Library.games(),
      Library.selected(),
      Library.shortcuts(),
      Library.buttons(),
      Library.startFullScreen(),
    ]);
    setChanges("keyboard", shortcuts);
    setChanges("controller", buttons);
  } catch (err) {
    app.innerHTML = messageView(
      "Can't load your library",
      errorText(err),
      `<button type="button" class="play" data-action="retry">Try again</button>`,
    );
    app.querySelector<HTMLElement>(".play")?.focus();
    return;
  }
  render();
  if (!games.length) return;
  // The details of the home row, the selected game first.
  for (const g of [selected(), ...homeGames()]) await loadDetails(g.id, false);
}

// ---- Rendering ----

function render(focus?: string) {
  closeMenu();
  if (route === "home") selectInstalled();
  if (!games.length && showsGames()) {
    app.innerHTML = emptyView();
  } else if (route === "home" && !homeGames().length) {
    app.innerHTML = noneInstalledView();
  } else {
    app.innerHTML =
      route === "home"
        ? homeView(homeGames(), selected(), account)
        : route === "hub"
          ? hubView(selected(), account)
          : route === "connect"
            ? connectView(account)
            : route === "settings"
              ? settingsView({ tab: settingsTab, account, fullScreen, startFullScreen, recording, controllers: controllers() })
              : libraryView(games, lib, account);
  }
  app.dataset.route = route;
  const target = focus ? app.querySelector<HTMLElement>(focus) : defaultFocus();
  target?.focus({ preventScroll: true });
  if (route === "home") revealSelectedTile();
}

function emptyView(): string {
  const connect = account.connected
    ? ""
    : `<button type="button" class="play" data-action="connect">Connect Steam account</button>`;
  const store = `<button type="button" class="pill-link" data-action="store">Open Steam store</button>`;
  return account.client
    ? messageView("No games yet", "Games you install or play in Steam show up here.", connect + store)
    : messageView(
        "Steam isn't installed",
        "Install Steam on this computer to play your games here, or connect your Steam account to browse them.",
        connect + store,
      );
}

/** The home screen when none of the games are installed. */
function noneInstalledView(): string {
  const collection = `<button type="button" class="play" data-action="collection">Browse your games</button>`;
  const store = `<button type="button" class="pill-link" data-action="store">Open Steam store</button>`;
  return messageView(
    "No games installed",
    account.client
      ? "Games you install in Steam show up here."
      : "Install Steam on this computer to play your games here.",
    collection + store,
  );
}

function defaultFocus(): HTMLElement | null {
  if (app.querySelector(".message")) return app.querySelector(".message .actions button");
  if (route === "home") return app.querySelector(".tile-selected");
  if (route === "hub") return app.querySelector(".play");
  if (route === "connect") return app.querySelector("#connect-key");
  if (route === "settings") return app.querySelector(`[data-settings-tab="${settingsTab}"]`);
  return app.querySelector(".lib-card, .history .row");
}

function navigate(to: Route, focus?: string) {
  route = to;
  recording = null;
  if (to === "settings") void showFullScreen();
  window.scrollTo(0, 0);
  render(focus);
}

/** Moves the home screen to the selected game without rebuilding it, so its colors animate. */
function updateHome() {
  const home = app.querySelector<HTMLElement>(".home");
  if (!home) return render();
  const g = selected();
  home.setAttribute("style", artVars(g.art));
  app.querySelector(".hero")!.innerHTML = hero(g);
  app.querySelector(".game-row")!.innerHTML = gameRow(homeGames(), g);
  app.querySelector(".selected")!.innerHTML = selectedGame(g);
  app.querySelector(".stat-cards")!.innerHTML = stats(g, account);
  app.querySelector(".hints")!.innerHTML = hints(g);
  app.querySelector<HTMLElement>(".tile-selected")?.focus({ preventScroll: true });
  revealSelectedTile();
}

// ---- Details ----

const loading = new Set<string>();

/** Loads the achievements, news and art colors of a game, and shows them. */
async function loadDetails(id: string, report = true) {
  if (games.find((g) => g.id === id)?.detailed !== false || loading.has(id)) return;
  loading.add(id);
  try {
    showDetails(await Library.details(id));
  } catch (err) {
    if (report && id === selectedId) showError(err);
  } finally {
    loading.delete(id);
  }
}

/** Updates what the screen shows of a game, without moving the focus. */
function showDetails(g: Game) {
  replaceGame(g);
  app.querySelector(`.tile[data-id="${g.id}"]`)?.setAttribute("style", artVars(g.art));
  if (g.id !== selected().id) return;
  if (route === "home") {
    app.querySelector(".home")?.setAttribute("style", artVars(g.art));
    const cards = app.querySelector(".stat-cards");
    if (cards) cards.innerHTML = stats(g, account);
  } else if (route === "hub") {
    app.querySelector(".hub")?.setAttribute("style", artVars(g.art));
    const details = app.querySelector("#hub-details");
    if (details) details.innerHTML = hubDetails(g, account);
  }
}

/** Takes in what changed in Steam while the app was in the background. */
async function refresh() {
  const installed = (list: Game[]) => list.map((g) => `${g.id}:${g.installed}`).join();
  const before = installed(games);
  try {
    games = await Library.games();
  } catch {
    return; // the games shown still play
  }
  if (installed(games) !== before && showsGames()) render();
}

function revealSelectedTile() {
  app.querySelector(".tile-on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function select(id: string) {
  if (id === selectedId) return;
  selectedId = id;
  Library.select(id).catch(showError);
  if (route === "home") updateHome();
  void loadDetails(id);
}

function browse(step: number) {
  const row = homeGames();
  const i = row.findIndex((g) => g.id === selectedId);
  const next = row[(i + step + row.length) % row.length];
  if (next) select(next.id);
}

function open(id: string, to: Route) {
  selectedId = id;
  Library.select(id).catch(showError);
  navigate(to);
  void loadDetails(id);
}

// ---- Actions ----

async function play(id: string) {
  try {
    const g = await Library.play(id);
    replaceGame(g);
    toast(`Launching ${g.title}…`);
    if (route === "home") app.querySelector(".stat-cards")!.innerHTML = stats(g, account);
    else render(".play");
  } catch (err) {
    showError(err);
  }
}

async function install(id: string) {
  try {
    const g = await Library.install(id);
    toast(`Installing ${g.title} in Steam…`);
  } catch (err) {
    showError(err);
  }
}

function quit() {
  App.quit().catch(showError);
}

function toggleFullScreen() {
  if (isMyGo()) currentWindow.toggleFullScreen().then(showFullScreen, showError);
  else if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

function openLibrary(tab: LibraryTab, focus?: string) {
  lib.tab = tab;
  navigate("library", focus);
}

async function connect(form: HTMLFormElement) {
  const data = new FormData(form);
  const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    account = await Library.connect(String(data.get("key")), String(data.get("account")));
  } catch (err) {
    button.disabled = false;
    button.textContent = "Connect";
    let el = form.querySelector(".form-error");
    if (!el) {
      el = document.createElement("p");
      el.className = "form-error";
      el.setAttribute("role", "alert");
      form.querySelector(".actions")!.before(el);
    }
    el.textContent = errorText(err);
    return;
  }
  toast(`Connected as ${account.name}`);
  route = "home";
  await boot();
}

async function disconnect() {
  try {
    await Library.disconnect();
  } catch (err) {
    return showError(err);
  }
  toast("Steam account disconnected");
  await boot();
}

// ---- Settings ----

let settingsTab: SettingsTab = "general";

/** The key or button slot whose new key or button the settings screen waits for. */
let recording: { id: Command; slot: number; device: Device } | null = null;

/** Whether the window fills the screen, as last asked. */
let fullScreen = false;

/** Whether the app opens in full screen. */
let startFullScreen = false;

function setStartFullScreen(on: boolean) {
  startFullScreen = on;
  app.querySelector(`[data-action="start-fullscreen"]`)?.setAttribute("aria-checked", String(on));
  Library.setStartFullScreen(on).catch((err) => {
    setStartFullScreen(!on);
    showError(err);
  });
}

/** Asks whether the window fills the screen, and turns the full screen switch to match. */
async function showFullScreen() {
  try {
    fullScreen = await App.fullScreen();
  } catch {
    return;
  }
  app.querySelector(`.switch[data-action="fullscreen"]`)?.setAttribute("aria-checked", String(fullScreen));
}

window.addEventListener("resize", () => void showFullScreen());
document.addEventListener("fullscreenchange", () => void showFullScreen());

function saveBindings(device: Device) {
  (device === "keyboard"
    ? Library.setShortcuts(changes("keyboard"))
    : Library.setButtons(changes("controller"))
  ).catch(showError);
}

const slotButton = (id: Command, slot: number, device: Device) =>
  `[data-action="key-slot"][data-device="${device}"][data-command="${id}"][data-slot="${slot}"]`;

/** Puts a key or a button in a slot of a command, and saves it. */
function bind(id: Command, slot: number, key: string, device: Device) {
  const from = setKey(id, slot, key, device);
  saveBindings(device);
  const name = nameOf(key, device);
  toast(from ? `${name} now runs ${labelOf(id)}, not ${labelOf(from)}` : `${labelOf(id)}: ${name}`);
}

/**
 * Takes the key pressed while recording, before the keyboard commands run.
 * A button slot takes no key: the key stops recording.
 */
window.addEventListener(
  "keydown",
  (e) => {
    if (!recording) return;
    const key = keyOf(e);
    if (!key) return; // a modifier, waiting for the key
    setDevice("keyboard");
    const { id, slot, device } = recording;
    recording = null;
    if (key === "Tab" || key === "Shift+Tab") {
      render(slotButton(id, slot, device));
      return; // moves the focus from the slot
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (key === "Delete") {
      const k = keysOf(id, device)[slot];
      if (k) {
        removeKey(id, k, device);
        saveBindings(device);
        toast(`${labelOf(id)}: ${nameOf(k, device)} removed`);
      }
    } else if (key !== "Escape" && device === "keyboard") {
      bind(id, slot, key, device);
    }
    render(slotButton(id, Math.min(slot, keysOf(id, device).length), device));
  },
  true,
);

/** Takes the controller button pressed while recording. A key slot takes no button: the button stops recording. */
function recordButton(button: Button) {
  const { id, slot, device } = recording!;
  recording = null;
  if (device === "controller") bind(id, slot, button, device);
  render(slotButton(id, Math.min(slot, keysOf(id, device).length), device));
}

function settingsAction(el: HTMLElement) {
  const was = recording;
  recording = null;
  const id = el.dataset.command as Command;
  const device = el.dataset.device as Device;
  switch (el.dataset.action) {
    case "settings-tab":
      settingsTab = el.dataset.settingsTab as SettingsTab;
      render(`[data-settings-tab="${settingsTab}"]`);
      break;
    case "key-slot": {
      const slot = Number(el.dataset.slot);
      if (was?.id !== id || was.slot !== slot || was.device !== device) recording = { id, slot, device };
      render(slotButton(id, slot, device));
      break;
    }
    case "key-reset":
      resetKeys(device, id);
      saveBindings(device);
      toast(`${labelOf(id)}: default ${device === "keyboard" ? "keys" : "buttons"}`);
      render(slotButton(id, 0, device));
      break;
    case "keys-reset-all":
      resetKeys(device);
      saveBindings(device);
      toast(`Default ${device === "keyboard" ? "keys" : "buttons"} restored`);
      render(`[data-action="keys-reset-all"][data-device="${device}"]`);
      break;
  }
}

app.addEventListener("click", (e) => {
  const el = (e.target as Element).closest<HTMLElement>("[data-action]");
  if (!el) return;
  const id = el.dataset.id ?? "";
  switch (el.dataset.action) {
    case "select":
      select(id);
      break;
    case "nav":
      navigate(el.dataset.to as Route);
      break;
    case "play":
      void play(id);
      break;
    case "install":
      void install(id);
      break;
    case "store":
      Store.open().catch(showError);
      break;
    case "search":
      lib.query = "";
      openLibrary("collection", "#lib-search");
      break;
    case "downloads":
      openLibrary("installed");
      break;
    case "collection":
      openLibrary("collection");
      break;
    case "settings":
      navigate("settings");
      break;
    case "fullscreen":
      toggleFullScreen();
      break;
    case "disconnect":
      void disconnect();
      break;
    case "quit":
      quit();
      break;
    case "more":
      gameMenu(el, id);
      break;
    case "store-game":
      Store.openGame(id).catch(showError);
      break;
    case "news":
      Store.openLink(el.dataset.url ?? "").catch(showError);
      break;
    case "connect":
      navigate("connect");
      break;
    case "key-page":
      Store.openLink("https://steamcommunity.com/dev/apikey").catch(showError);
      break;
    case "retry":
      void boot();
      break;
    case "lib-tab":
      lib.tab = el.dataset.tab as LibraryTab;
      render(`[data-tab="${lib.tab}"]`);
      break;
    case "open":
      // Home shows only the installed games; the hub installs the others.
      open(id, games.find((g) => g.id === id)?.installed ? "home" : "hub");
      break;
    case "hub":
      open(id, "hub");
      break;
    case "settings-tab":
    case "key-slot":
    case "key-reset":
    case "keys-reset-all":
      settingsAction(el);
      break;
    case "reload":
      void boot();
      break;
    case "start-fullscreen":
      setStartFullScreen(!startFullScreen);
      break;
  }
});

app.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  if (form.id !== "connect-form") return;
  e.preventDefault();
  void connect(form);
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "lib-search") lib.query = el.value;
  else if (el.id === "lib-sort") lib.sort = el.value as LibrarySort;
  else return;
  app.querySelector("#lib-results")!.innerHTML = libraryResults(games, lib);
});

// ---- Menus ----

let menu: { el: HTMLElement; anchor: HTMLElement } | null = null;

/** The menu of the other things to do with a game, under the element that opens it. */
function gameMenu(anchor: HTMLElement, id: string) {
  openMenu(anchor, [
    ...(route === "hub" ? [] : [{ label: "Open game hub", run: () => open(id, "hub") }]),
    ...(route === "library" ? [] : [{ label: "Show in library", run: () => openLibrary("collection") }]),
    { label: "Store page", run: () => Store.openGame(id).catch(showError) },
  ]);
}

function openMenu(anchor: HTMLElement, items: { label: string; run: () => void }[]) {
  const wasOpen = menu?.anchor === anchor;
  closeMenu();
  if (wasOpen) return;
  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "menu");
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = item.label;
    button.addEventListener("click", () => {
      closeMenu(false);
      item.run();
    });
    el.append(button);
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.left, window.innerWidth - el.offsetWidth - 16);
  const below = r.bottom + 10 + el.offsetHeight < window.innerHeight;
  el.style.left = `${left + window.scrollX}px`;
  el.style.top = `${(below ? r.bottom + 10 : r.top - 10 - el.offsetHeight) + window.scrollY}px`;
  anchor.setAttribute("aria-expanded", "true");
  menu = { el, anchor };
  el.querySelector("button")?.focus();
}

function closeMenu(restoreFocus = true) {
  if (!menu) return;
  const { el, anchor } = menu;
  menu = null;
  el.remove();
  anchor.removeAttribute("aria-expanded");
  if (restoreFocus && anchor.isConnected) anchor.focus();
}

document.addEventListener("pointerdown", (e) => {
  if (menu && !menu.el.contains(e.target as Node) && !menu.anchor.contains(e.target as Node)) closeMenu(false);
  // Pressing a button of the screen stops recording when it is clicked.
  if (recording && !(e.target as Element).closest("[data-action]")) {
    const { id, slot, device } = recording;
    recording = null;
    render(slotButton(id, slot, device));
  }
});

// ---- Commands ----

const tabsOrder: Route[] = ["home", "library"];

const isDirection = (c: Command): c is Direction => c === "left" || c === "right" || c === "up" || c === "down";

/** Whether a key clicks a focused button by itself. */
const clicksButtons = (key: string) => key === "Enter" || key === "Space";

function moveFocus(items: HTMLElement[], step: number) {
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[Math.max(0, Math.min(items.length - 1, i < 0 ? 0 : i + step))]?.focus();
}

/** Moves focus in the library grid by a row or a column. */
function gridMove(direction: Direction): boolean {
  const cards = [...app.querySelectorAll<HTMLElement>(".lib-card, .history .row")];
  const i = cards.indexOf(document.activeElement as HTMLElement);
  if (i < 0) {
    if (direction !== "down") return false;
    cards[0]?.focus();
    return true;
  }
  const top = cards[0]!.offsetTop;
  const columns = Math.max(1, cards.filter((c) => c.offsetTop === top).length);
  const next = i + { left: -1, right: 1, up: -columns, down: columns }[direction];
  if (next < 0) {
    app.querySelector<HTMLElement>("#lib-search")?.focus();
    return true;
  }
  cards[Math.min(next, cards.length - 1)]?.focus();
  return true;
}

/** The elements of the screen, or of a part of it, that take the focus. */
function focusables(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")].filter(
    (el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0,
  );
}

/**
 * The element nearest to another in a direction, of some elements: of those
 * level with it, or else of those less than 30° off the direction, or else
 * of any in the direction.
 */
function nearest(from: HTMLElement, items: HTMLElement[], direction: Direction): HTMLElement | undefined {
  const a = from.getBoundingClientRect();
  const [ax, ay] = [a.left + a.width / 2, a.top + a.height / 2];
  const across = direction === "left" || direction === "right";
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const b of items) {
    if (b === from) continue;
    const r = b.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax;
    const dy = r.top + r.height / 2 - ay;
    // How far along the direction, and how far off it.
    const [along, off] = direction === "left" ? [-dx, dy] : direction === "right" ? [dx, dy] : direction === "up" ? [-dy, dx] : [dy, dx];
    if (along <= 4) continue;
    const level = across ? r.top < a.bottom && r.bottom > a.top : r.left < a.right && r.right > a.left;
    const tier = level ? 0 : Math.abs(off) <= along * 0.58 ? 1 : 2;
    const score = tier * 1e6 + along + Math.abs(off) * 3;
    if (score < bestScore) [best, bestScore] = [b, score];
  }
  return best;
}

/** Focuses the nearest element in a direction, of the screen or a part of it; false if there is none. */
function spatialMove(direction: Direction, scope: ParentNode = app): boolean {
  const items = focusables(scope);
  const from = document.activeElement as HTMLElement;
  const next = items.includes(from) ? nearest(from, items, direction) : items[0];
  if (!next) return false;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

/** Focuses the nearest button in a direction; a section of the sidebar shows as it gets the focus. */
function settingsMove(direction: Direction) {
  const from = document.activeElement as HTMLElement;
  const buttons = focusables(app.querySelector(".settings")!);
  if (!buttons.includes(from)) return buttons[0]?.focus();
  let best = nearest(from, buttons, direction);
  if (!best) return;
  // From the section shown, the sidebar is entered at the section's tab.
  if (best.closest(".settings-nav") && from.closest(".settings-pane"))
    best = app.querySelector<HTMLElement>(`[data-settings-tab="${settingsTab}"]`) ?? best;
  const tab = best.dataset.settingsTab as SettingsTab | undefined;
  if (tab && from.dataset.settingsTab && tab !== settingsTab) {
    settingsTab = tab;
    render(`[data-settings-tab="${tab}"]`);
  } else {
    best.focus();
    best.scrollIntoView({ block: "nearest" });
  }
}

/** Picks the next or the previous option of a list: a controller can't open it. */
function stepOption(select: HTMLSelectElement, step: number) {
  const n = select.options.length;
  select.selectedIndex = (select.selectedIndex + step + n) % n;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

const focusTile = () => app.querySelector<HTMLElement>(".tile-selected")?.focus();

/** Runs a command that works on every screen; false for the others. */
function runAnywhere(command: Command): boolean {
  switch (command) {
    case "prevTab":
    case "nextTab": {
      const i = tabsOrder.indexOf(route === "library" ? "library" : "home");
      navigate(tabsOrder[(i + (command === "nextTab" ? 1 : -1) + tabsOrder.length) % tabsOrder.length]!);
      break;
    }
    case "games":
      navigate("home");
      break;
    case "library":
      navigate("library");
      break;
    case "store":
      Store.open().catch(showError);
      break;
    case "search":
      lib.query = "";
      openLibrary("collection", "#lib-search");
      break;
    case "installed":
      openLibrary("installed");
      break;
    case "fullscreen":
      toggleFullScreen();
      break;
    case "reload":
      void boot();
      break;
    case "settings":
      navigate("settings");
      break;
    case "quit":
      quit();
      break;
    default:
      return false;
  }
  return true;
}

/**
 * Runs a command on the focused element, for a key or a controller button;
 * key is the key pressed, none for a button. False when the command does
 * nothing there, so that the key does what it does by itself.
 */
function runCommand(command: Command, key?: string): boolean {
  const target = document.activeElement ?? document.body;

  // The confirm command clicks the focused button, as Enter and Space do.
  const onButton = target.closest<HTMLElement>("button:not(.tile)");
  const confirmButton = () => {
    if (!onButton || (key && clicksButtons(key))) return false;
    onButton.click();
    return true;
  };

  if (menu) {
    const items = [...menu.el.querySelectorAll<HTMLElement>("button")];
    if (command === "back" || command === "options") closeMenu();
    else if (command === "up" || command === "down") moveFocus(items, command === "down" ? 1 : -1);
    else if (command === "confirm" ? !confirmButton() : !runAnywhere(command)) return false;
    return true;
  }

  const field = target.closest<HTMLElement>("input, select, textarea");
  if (field) {
    if (key && typesText(key)) return false;
    const list = field instanceof HTMLSelectElement ? field : null;
    if (command === "back") field.blur();
    else if (list && key && (command === "up" || command === "down")) return false; // the arrows pick an option
    else if (list && !key && (command === "left" || command === "right" || command === "confirm"))
      stepOption(list, command === "left" ? -1 : 1);
    else if (command === "down" && field.id === "lib-search") return gridMove("down");
    else if (isDirection(command)) return spatialMove(command);
    else return runAnywhere(command);
    return true;
  }

  if (runAnywhere(command)) return true;

  // A message, such as "No games yet" or "Loading your Steam library…".
  if (app.querySelector(".message")) {
    if (isDirection(command)) return spatialMove(command);
    return command === "confirm" && confirmButton();
  }

  switch (route) {
    case "home": {
      // The header, which is above the game row.
      const bar = target.closest(".topbar");
      if (bar && (command === "down" || command === "back")) focusTile();
      else if (bar && isDirection(command)) spatialMove(command, bar);
      else if (bar) return command === "confirm" && confirmButton();
      else if (command === "left" || command === "right") browse(command === "right" ? 1 : -1);
      else if (command === "down") navigate("hub");
      else if (command === "up" && target.closest(".tile")) app.querySelector<HTMLElement>(".tab-on")?.focus();
      else if (command === "up") focusTile();
      else if (command === "options") app.querySelector<HTMLElement>(`.selected [data-action="more"]`)?.click();
      else if (command === "confirm" && onButton) return confirmButton();
      else if (command === "confirm") {
        const g = selected();
        void (g.installed ? play(g.id) : install(g.id));
      } else return false;
      return true;
    }
    case "hub":
    case "connect":
      if (command === "back") navigate("home");
      else if (command === "options" && route === "hub") app.querySelector<HTMLElement>(`[data-action="more"]`)?.click();
      else if (isDirection(command)) return spatialMove(command);
      else return command === "confirm" && confirmButton();
      return true;
    case "settings": {
      const inPane = target.closest(".settings-pane");
      if (command === "back" && inPane) app.querySelector<HTMLElement>(`[data-settings-tab="${settingsTab}"]`)?.focus();
      else if (command === "back") navigate("home");
      else if (isDirection(command)) settingsMove(command);
      else return command === "confirm" && confirmButton();
      return true;
    }
    case "library": {
      const card = target.closest<HTMLElement>(".lib-card, .history .row");
      if (command === "back") navigate("home");
      else if (command === "options" && card) gameMenu(card, card.dataset.id!);
      else if (isDirection(command)) return card || !app.contains(target) ? gridMove(command) : spatialMove(command);
      else return command === "confirm" && confirmButton();
      return true;
    }
  }
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  const key = keyOf(e);
  if (!key) return;
  if (setDevice("keyboard")) showShortcuts();
  const command = commandOf(key, "keyboard");
  if (command && runCommand(command, key)) e.preventDefault();
});

// ---- Keys or buttons ----

/** Shows the keys or the buttons of a device from now on; false if it already did. */
function setDevice(device: Device): boolean {
  document.documentElement.dataset.input = device;
  return setInputDevice(device);
}

/** A selector of an element of the screen, to focus it again once the screen is drawn again. */
function selectorOf(el: Element | null): string | undefined {
  if (!(el instanceof HTMLElement) || !app.contains(el)) return undefined;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const attrs = ["action", "settingsTab", "device", "command", "slot", "id", "tab", "to"]
    .filter((k) => el.dataset[k] !== undefined)
    .map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(el.dataset[k]!)}"]`);
  return attrs.length ? attrs.join("") : undefined;
}

/** Shows the keys or the buttons of the device in use, in the hints of the screen. */
function showShortcuts() {
  if (app.querySelector(".message")) return;
  if (route === "home") {
    const el = app.querySelector(".hints");
    if (el) el.innerHTML = hints(selected());
  } else if (route === "settings") {
    render(selectorOf(document.activeElement));
  }
}

// A click of the mouse shows the keys again, as a tap of the screen doesn't.
document.addEventListener("click", (e) => {
  if (e.isTrusted && e.detail > 0 && (e as PointerEvent).pointerType !== "touch" && setDevice("keyboard")) showShortcuts();
});

/** Runs the command of a controller button. With nothing focused, a direction focuses the screen. */
function padCommand(command: Command) {
  const focused = document.activeElement;
  if (!menu && (!focused || focused === document.body)) {
    const target = defaultFocus();
    target?.focus({ preventScroll: true });
    if (target && isDirection(command)) return;
  }
  runCommand(command);
}

/** Scrolls what the focused element is in, for the right stick. */
function scrollBy(dy: number) {
  let el = document.activeElement?.parentElement ?? null;
  for (; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) break;
  }
  (el && el !== document.body ? el : (document.scrollingElement ?? document.documentElement)).scrollBy(0, dy);
}

startGamepads({
  input(familyChanged) {
    if (setDevice("controller") || familyChanged) showShortcuts();
  },
  press(button, repeat) {
    if (recording) {
      if (!repeat) recordButton(button);
      return;
    }
    const command = commandOf(button, "controller");
    // Only the directions repeat while their button is held.
    if (command && (!repeat || isDirection(command))) padCommand(command);
  },
  move(direction) {
    if (!recording) padCommand(direction);
  },
  scroll: scrollBy,
  change() {
    if (route === "settings" && settingsTab === "controller" && !recording) render(selectorOf(document.activeElement));
  },
});

// ---- Feedback ----

let toastTimer = 0;

function toast(message: string, error = false) {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.toggle("toast-error", error);
  el.classList.add("toast-on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("toast-on"), 2600);
}

function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function showError(err: unknown) {
  toast(errorText(err), true);
}

setInterval(() => {
  for (const el of document.querySelectorAll("[data-clock]")) el.textContent = clock();
}, 5_000);

window.addEventListener("focus", () => {
  if (games.length) void refresh();
});

void boot();
