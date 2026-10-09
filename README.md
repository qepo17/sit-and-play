# Steam Library — Console Mode

A desktop app built with [MyGo](https://github.com/egoist/mygo): a Go backend and a
TypeScript frontend (Vite) shown in the system webview.

Screens: **Home** (game row), **Game hub** and **Library** (installed, collection,
last two weeks).

It shows your real Steam library without signing in: the Steam client on this computer
tells which games are installed and played (with playtime), the Steam store describes
them (art, tags, price), and **Play** / **Install** hand the game to Steam
(`steam://rungameid/…`, `steam://install/…`). On WSL it finds Steam for Windows under
`/mnt/c` and launches it with `steam.exe`; `STEAM_DIR` overrides where Steam is looked for.

Connecting a Steam account with a [Web API key](https://steamcommunity.com/dev/apikey)
(Settings, or "Connect Steam account" on the home screen) is optional: it adds the
games you own but never played on this computer, and your achievements.

## Requirements

- Go 1.27+ (fetched automatically by the Go toolchain) and [Bun](https://bun.sh)
- Linux: WebKitGTK 4.1 — `sudo apt install libwebkit2gtk-4.1-0`

## Develop

```sh
bun install
bun run dev      # mygo dev: runs the app with live reload
bun run dev:web  # the page alone in a browser, with made-up games
```

## Build

```sh
bun run build    # build/<os>-<arch>/: executable, .deb, tarball with install.sh
go test ./...
```

## Layout

- `main.go` — the window
- `library.go` — the `Library` and `Store` services the page calls; state (the selected
  game, and the Web API key when connected) is saved to `library.json` in the app's
  user-data directory
- `local.go`, `vdf.go` — reading the Steam client's files: libraries, app manifests,
  playtime, the signed-in account
- `steam.go` — the Steam Web API and store; `art.go` — a game's colors from its picture
- `src/demo-games.json` — the made-up games of `bun run dev:web`
- `src/main.ts` — routing, actions and keyboard controls
- `src/shortcuts.ts` — the keyboard commands and their keys
- `src/views/` — Home, Game hub, Library and Settings screens
- `src/mygo.ts` — the typed client, generated from the Go code

## Controls

`←` `→` browse · `Enter` play or install · `↓` game hub · `Q` `E` switch tab · `Esc` back ·
`1` `2` `3` games, library, store · `/` search · `I` installed games · `F11` full screen ·
`F5` reload · `F1` settings · `Ctrl+Q` quit

Settings (the gear, or `F1`) has General (full screen, start in full screen, reload), Steam
account, Keyboard and Quit. Under Keyboard every action has a key and an alternate: select one and press the new
key (`Esc` cancels, `Delete` clears). The changes are saved in `library.json`.
