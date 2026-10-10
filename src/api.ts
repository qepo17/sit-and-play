import { isMyGo } from "mygo-runtime";
import * as client from "./mygo";
import type { Account, Game, UpdateStatus } from "./mygo";

export type { Account, Game, Art, Achievement, News, Price, UpdateStatus } from "./mygo";

type Api = {
  Library: typeof client.Library;
  Store: typeof client.Store;
  App: typeof client.App;
  Updates: typeof client.Updates;
  /** Calls a function whenever updating gets further. */
  onUpdate: (listener: (s: UpdateStatus) => void) => void;
};

/**
 * A stand-in for the Go services when the page is opened in a browser tab
 * of the dev server, so the layout can be worked on outside the app. It
 * reads made-up games and keeps state in memory.
 */
async function browserApi(): Promise<Api> {
  const { default: demo } = await import("./demo-games.json");
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const games: Game[] = demo.map(({ lastPlayedDaysAgo, achievements, news, ...g }) => ({
    ...g,
    lastPlayed: daysAgo(lastPlayedDaysAgo),
    achievements: achievements.map(({ unlockedDaysAgo, ...a }) => ({
      ...a,
      ...(unlockedDaysAgo === undefined ? {} : { unlockedAt: daysAgo(unlockedDaysAgo) }),
    })),
    news: news.map(({ whenDaysAgo, ...n }) => ({ ...n, when: daysAgo(whenDaysAgo) })),
  }));
  let account: Account = { connected: false, steamID: "76561190000000000", name: "Qepo", avatar: "", client: true };
  let selected = games[0]!.id;
  let shortcuts: Record<string, string[]> = {};
  let buttons: Record<string, string[]> = {};
  let startFullScreen = false;
  const find = (id: string) => {
    const g = games.find((g) => g.id === id);
    if (!g) throw new Error(`no game "${id}"`);
    return g;
  };
  const web = (url: string) => void window.open(url, "_blank");
  return {
    Library: {
      account: async () => account,
      connect: async (apiKey) => {
        if (!apiKey.trim()) throw new Error("enter your Steam Web API key");
        return (account = { ...account, connected: true });
      },
      disconnect: async () => {
        account = { ...account, connected: false };
      },
      games: async () => structuredClone(games),
      details: async (id) => structuredClone(find(id)),
      selected: async () => selected,
      select: async (id) => {
        selected = find(id).id;
      },
      install: async (id) => {
        const g = find(id);
        g.installed = true;
        return structuredClone(g);
      },
      play: async (id) => {
        const g = find(id);
        if (!g.installed) throw new Error(`${g.title} is not installed`);
        g.lastPlayed = new Date().toISOString();
        return structuredClone(g);
      },
      shortcuts: async () => structuredClone(shortcuts),
      setShortcuts: async (s) => {
        shortcuts = structuredClone(s);
      },
      buttons: async () => structuredClone(buttons),
      setButtons: async (b) => {
        buttons = structuredClone(b);
      },
      startFullScreen: async () => startFullScreen,
      setStartFullScreen: async (on) => {
        startFullScreen = on;
      },
    },
    Store: {
      open: async () => web("https://store.steampowered.com/"),
      openGame: async (id) => web(`https://store.steampowered.com/app/${id}`),
      openLink: async (link) => web(link),
    },
    App: {
      fullScreen: async () => document.fullscreenElement !== null,
      quit: async () => window.close(),
    },
    Updates: {
      status: async () => ({ state: "unsupported", current: "dev", progress: 0 }),
      check: async () => {},
      restart: async () => {},
    },
    onUpdate: () => {},
  };
}

export const { Library, Store, App, Updates, onUpdate }: Api =
  !isMyGo() && import.meta.env.DEV
    ? await browserApi()
    : { ...client, onUpdate: (listener) => void client.events.update.on(listener) };
