import "./style.css";
import { currentWindow, isMyGo } from "mygo-runtime";
import { Library, Store, type Game } from "./api";
import { clock } from "./format";
import { artVars } from "./ui";
import { gameRow, homeView, selectedGame, stats } from "./views/home";
import { hubView } from "./views/hub";
import { libraryResults, libraryView, type LibraryState, type LibraryTab, type LibrarySort } from "./views/library";

type Route = "home" | "hub" | "library";

const app = document.querySelector<HTMLElement>("#app")!;

let games: Game[] = await Library.games();
let selectedId = await Library.selected();
let route: Route = "home";
const lib: LibraryState = { tab: "collection", query: "", sort: "newest" };

const selected = () => games.find((g) => g.id === selectedId) ?? games[0]!;

function replaceGame(g: Game) {
  games = games.map((old) => (old.id === g.id ? g : old));
}

// ---- Rendering ----

function render(focus?: string) {
  closeMenu();
  app.innerHTML =
    route === "home" ? homeView(games, selected()) : route === "hub" ? hubView(selected()) : libraryView(games, lib);
  app.dataset.route = route;
  const target = focus ? app.querySelector<HTMLElement>(focus) : defaultFocus();
  target?.focus({ preventScroll: true });
  if (route === "home") revealSelectedTile();
}

function defaultFocus(): HTMLElement | null {
  if (route === "home") return app.querySelector(".tile-selected");
  if (route === "hub") return app.querySelector(".play");
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
  app.querySelector(".game-row")!.innerHTML = gameRow(games, g);
  app.querySelector(".selected")!.innerHTML = selectedGame(g);
  app.querySelector(".stat-cards")!.innerHTML = stats(g);
  app.querySelector<HTMLElement>(".tile-selected")?.focus({ preventScroll: true });
  revealSelectedTile();
}

function revealSelectedTile() {
  app.querySelector(".tile-on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function select(id: string) {
  if (id === selectedId) return;
  selectedId = id;
  Library.select(id).catch(showError);
  if (route === "home") updateHome();
}

function browse(step: number) {
  const i = games.findIndex((g) => g.id === selectedId);
  const next = games[(i + step + games.length) % games.length];
  if (next) select(next.id);
}

// ---- Actions ----

async function play(id: string) {
  try {
    const g = await Library.play(id);
    replaceGame(g);
    toast(`Launching ${g.title}…`);
    if (route === "home") app.querySelector(".stat-cards")!.innerHTML = stats(g);
    else render(".play");
  } catch (err) {
    showError(err);
  }
}

async function install(id: string) {
  try {
    const g = await Library.install(id);
    replaceGame(g);
    toast(`${g.title} is installed`);
    if (route === "home") updateHome();
    else render(".play");
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
      openMenu(el, [{ label: "Toggle full screen", run: toggleFullScreen }]);
      break;
    case "more":
      openMenu(el, [
        ...(route === "hub" ? [] : [{ label: "Open game hub", run: () => navigate("hub") }]),
        { label: "Show in library", run: () => openLibrary("collection") },
        { label: "Open Steam store", run: () => Store.open().catch(showError) },
      ]);
      break;
    case "lib-tab":
      lib.tab = el.dataset.tab as LibraryTab;
      render(`[data-tab="${lib.tab}"]`);
      break;
    case "open":
      selectedId = id;
      Library.select(id).catch(showError);
      navigate("home");
      break;
    case "hub":
      selectedId = id;
      Library.select(id).catch(showError);
      navigate("hub");
      break;
  }
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
    const i = tabsOrder.indexOf(route === "hub" ? "home" : route);
    navigate(tabsOrder[(i + (key === "e" ? 1 : -1) + tabsOrder.length) % tabsOrder.length]!);
    e.preventDefault();
    return;
  }

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

function showError(err: unknown) {
  toast(err instanceof Error ? err.message : String(err), true);
}

setInterval(() => {
  for (const el of document.querySelectorAll("[data-clock]")) el.textContent = clock();
}, 5_000);

render();
