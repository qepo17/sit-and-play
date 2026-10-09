import "./style.css";
import { currentWindow, isMyGo } from "mygo-runtime";
import { Library, Store, type Account, type Game } from "./api";
import { clock } from "./format";
import { artVars, hero } from "./ui";
import { connectView, messageView } from "./views/connect";
import { gameRow, hints, homeView, selectedGame, stats } from "./views/home";
import { hubDetails, hubView } from "./views/hub";
import { libraryResults, libraryView, type LibraryState, type LibraryTab, type LibrarySort } from "./views/library";

type Route = "home" | "hub" | "library" | "connect";

/** How many of the most recently played games the home row shows. */
const ROW = 15;

const app = document.querySelector<HTMLElement>("#app")!;

let account: Account = { connected: false, steamID: "", name: "", avatar: "", client: false };
let games: Game[] = [];
let selectedId = "";
let route: Route = "home";
const lib: LibraryState = { tab: "installed", query: "", sort: "recent" };

const selected = () => games.find((g) => g.id === selectedId) ?? games[0]!;

/** The home row: the latest games played, and the selected one. */
function homeGames(): Game[] {
  const row = games.slice(0, ROW);
  const g = selected();
  return row.includes(g) ? row : [g, ...row.slice(0, ROW - 1)];
}

function replaceGame(g: Game) {
  games = games.map((old) => (old.id === g.id ? g : old));
}

async function boot() {
  closeMenu();
  app.innerHTML = messageView("Loading your Steam library…");
  try {
    [account, games, selectedId] = await Promise.all([Library.account(), Library.games(), Library.selected()]);
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
  if (!games.length && route !== "connect") {
    app.innerHTML = emptyView();
  } else {
    app.innerHTML =
      route === "home"
        ? homeView(homeGames(), selected(), account)
        : route === "hub"
          ? hubView(selected(), account)
          : route === "connect"
            ? connectView(account)
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

function defaultFocus(): HTMLElement | null {
  if (!games.length && route !== "connect") return app.querySelector(".actions button");
  if (route === "home") return app.querySelector(".tile-selected");
  if (route === "hub") return app.querySelector(".play");
  if (route === "connect") return app.querySelector("#connect-key");
  return app.querySelector(".lib-card, .history .row");
}

function navigate(to: Route, focus?: string) {
  route = to;
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
  if (installed(games) !== before && route !== "connect") render();
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

function toggleFullScreen() {
  if (isMyGo()) void currentWindow.toggleFullScreen();
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
    case "settings":
      openMenu(el, [
        { label: "Toggle full screen", run: toggleFullScreen },
        account.connected
          ? { label: "Disconnect Steam account", run: () => void disconnect() }
          : { label: "Connect Steam account", run: () => navigate("connect") },
      ]);
      break;
    case "more":
      openMenu(el, [
        ...(route === "hub" ? [] : [{ label: "Open game hub", run: () => navigate("hub") }]),
        { label: "Show in library", run: () => openLibrary("collection") },
        { label: "Store page", run: () => Store.openGame(id).catch(showError) },
      ]);
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
      open(id, "home");
      break;
    case "hub":
      open(id, "hub");
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
});

// ---- Keyboard ----

const tabsOrder: Route[] = ["home", "library"];

function moveFocus(items: HTMLElement[], step: number) {
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[Math.max(0, Math.min(items.length - 1, i < 0 ? 0 : i + step))]?.focus();
}

/** Moves focus in the library grid by a row or a column. */
function gridMove(key: string): boolean {
  const cards = [...app.querySelectorAll<HTMLElement>(".lib-card, .history .row")];
  const i = cards.indexOf(document.activeElement as HTMLElement);
  if (i < 0) {
    if (key !== "ArrowDown") return false;
    cards[0]?.focus();
    return true;
  }
  const top = cards[0]!.offsetTop;
  const columns = Math.max(1, cards.filter((c) => c.offsetTop === top).length);
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key] ?? 0;
  const next = i + step;
  if (next < 0) {
    app.querySelector<HTMLElement>("#lib-search")?.focus();
    return true;
  }
  cards[Math.min(next, cards.length - 1)]?.focus();
  return true;
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

  if (menu) {
    const items = [...menu.el.querySelectorAll<HTMLElement>("button")];
    if (e.key === "Escape") closeMenu();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") moveFocus(items, e.key === "ArrowDown" ? 1 : -1);
    else return; // Enter, Space and Tab work as they do on buttons
    e.preventDefault();
    return;
  }

  if (e.key === "F11") {
    e.preventDefault();
    toggleFullScreen();
    return;
  }

  const field = (e.target as Element).closest("input, select, textarea");
  if (field) {
    if (e.key === "Escape") (field as HTMLElement).blur();
    else if (e.key === "ArrowDown" && field.id === "lib-search" && gridMove("ArrowDown")) e.preventDefault();
    return;
  }

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "q" || key === "e") {
    const i = tabsOrder.indexOf(route === "library" ? "library" : "home");
    navigate(tabsOrder[(i + (key === "e" ? 1 : -1) + tabsOrder.length) % tabsOrder.length]!);
    e.preventDefault();
    return;
  }

  if (!games.length) return; // loading, or a message such as "No games yet"
  const onButton = (e.target as Element).closest("button:not(.tile)");
  switch (route) {
    case "home":
      if (key === "ArrowLeft" || key === "ArrowRight") browse(key === "ArrowRight" ? 1 : -1);
      else if (key === "ArrowDown") navigate("hub");
      else if (key === "Enter" && !onButton) {
        const g = selected();
        void (g.installed ? play(g.id) : install(g.id));
      } else return;
      e.preventDefault();
      break;
    case "hub":
    case "connect":
      if (key === "Escape" || key === "Backspace") {
        navigate("home");
        e.preventDefault();
      }
      break;
    case "library":
      if (key === "Escape" || key === "Backspace") navigate("home");
      else if (key.startsWith("Arrow") && gridMove(key)) {
        /* moved */
      } else return;
      e.preventDefault();
      break;
  }
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
