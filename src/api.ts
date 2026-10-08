import { isMyGo } from "mygo-runtime";
import * as client from "./mygo";
import type { Game } from "./mygo";

export type { Game, Art, AddOn, Achievement, News } from "./mygo";

type Api = { Library: typeof client.Library; Store: typeof client.Store };

/**
 * A stand-in for the Go services when the page is opened in a browser tab
 * of the dev server, so the layout can be worked on outside the app. It
 * reads the catalog the Go side embeds and keeps state in memory.
 */
async function browserApi(): Promise<Api> {
  const { default: catalog } = await import("../catalog.json");
  const now = Date.now();
  const games: Game[] = catalog.map(({ lastPlayedDaysAgo, ...g }) => ({
    ...g,
    lastPlayed: new Date(now - lastPlayedDaysAgo * 86_400_000).toISOString(),
  }));
  let selected = games[0]!.id;
  const find = (id: string) => {
    const g = games.find((g) => g.id === id);
    if (!g) throw new Error(`no game "${id}"`);
    return g;
  };
  return {
    Library: {
      games: async () => structuredClone(games),
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
    },
    Store: {
      open: async () => {
        window.open("https://store.steampowered.com/", "_blank");
      },
    },
  };
}

export const { Library, Store }: Api =
  !isMyGo() && import.meta.env.DEV ? await browserApi() : client;
