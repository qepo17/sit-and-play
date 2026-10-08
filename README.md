# Steam Library — Console Mode

A desktop app built with [MyGo](https://github.com/egoist/mygo): a Go backend and a
TypeScript frontend (Vite) shown in the system webview.

Screens: **Home** (game row), **Game hub** and **Library** (installed, collection,
purchase history).

## Requirements

- Go 1.27+ (fetched automatically by the Go toolchain) and [Bun](https://bun.sh)
- Linux: WebKitGTK 4.1 — `sudo apt install libwebkit2gtk-4.1-0`

## Develop

```sh
bun install
bun run dev      # mygo dev: runs the app with live reload
bun run dev:web  # the page alone in a browser, with in-memory data
```

## Build

```sh
bun run build    # build/<os>-<arch>/: executable, .deb, tarball with install.sh
go test ./...
```

## Layout

- `main.go` — the window
- `library.go` — the `Library` and `Store` services the page calls; state is saved to
  `library.json` in the app's user-data directory
- `catalog.json` — the sample games, embedded into the binary
- `src/main.ts` — routing, actions and keyboard controls
- `src/views/` — Home, Game hub and Library screens
- `src/mygo.ts` — the typed client, generated from the Go code

## Controls

`←` `→` browse · `Enter` play · `↓` game hub · `Q` `E` switch tab · `Esc` back ·
`F11` full screen
