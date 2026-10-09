# Sit and Play

[![CI](https://github.com/qepo17/sit-and-play/actions/workflows/ci.yml/badge.svg)](https://github.com/qepo17/sit-and-play/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A controller-friendly desktop interface for your Steam library, built with
[MyGo](https://github.com/egoist/mygo), Go, and TypeScript. Browse your games,
open a game hub, and launch or install games through Steam.

Sit and Play is an independent project and is not affiliated with Valve.

## What you can do

- Browse installed and recently played games without entering an API key.
- View game artwork, descriptions, prices, news, and playtime.
- Play or install games through the Steam client.
- Navigate with a keyboard, mouse, or controller, including Xbox, PlayStation, and Nintendo button hints.
- Customize keyboard shortcuts and controller bindings, and start in full screen.
- Optionally connect a Steam account to add owned games missing from the local library and view achievements.

This is an early project. Release builds target Windows and Linux on x86-64.
macOS and ARM builds are not part of the release pipeline.

## Install

Download a package from [GitHub Releases](https://github.com/qepo17/sit-and-play/releases).
If no release is available yet, [build from source](#build-from-source).
Keep Steam installed and signed in so Sit and Play can find your library and launch games.

### Windows

Run `Sit and Play Setup <version>.exe`, then open Sit and Play from the Start menu.
The installer installs for your user and includes an uninstaller.
The app uses [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/),
which must be installed on your system.

Release builds are currently unsigned. Windows may show a SmartScreen warning.

### Linux

On Debian or Ubuntu, install the downloaded package with apt so it installs the runtime dependencies too.
Replace `<version>` with the release you downloaded.

```sh
sudo apt install ./sit-and-play_<version>_amd64.deb
```

On other distributions, install GTK 3 and WebKitGTK 4.1 through your package manager,
then extract `sit-and-play-<version>-linux-amd64.tar.gz` and run `./sit-and-play` inside it.
Keep the extracted files together.

For a per-user install, download `install.sh` from the same release into the directory containing the archive, then run:

```sh
sh install.sh sit-and-play-<version>-linux-amd64.tar.gz
```

The installer adds Sit and Play to your applications menu and `~/.local/bin`.
The `.deb` package adds the `sit-and-play` command to `/usr/bin`.

## Connect your library

Sit and Play reads the Steam client's library folders, installed game manifests,
and local play history. It asks Steam's online services for game details and artwork.
Play and Install open `steam://` links in your Steam client.

If Steam is installed in a custom directory, set `STEAM_DIR` before starting the app.
On Linux or WSL, for example:

```sh
STEAM_DIR="/path/to/Steam" sit-and-play
```

On Windows, set the variable in PowerShell before launching the app from that shell:

```powershell
$env:STEAM_DIR = "D:\Steam"
& "$env:LOCALAPPDATA\Programs\Sit and Play\Sit and Play.exe"
```

WSL can detect Steam for Windows under `/mnt/c` and launch it through `steam.exe`.
Running the desktop app in WSL also needs a graphical session such as WSLg.

To connect an account, open **Settings → Steam account** and enter your Steam profile
and a [Steam Web API key](https://steamcommunity.com/dev/apikey).
Sit and Play saves the key in `library.json` in its local user-data directory.
The key is stored as plain text. Do not share this file or include it in bug reports.
Disconnect the account in Settings to remove the saved key.

## Controls

These are the default bindings. Change them under **Settings → Keyboard** or **Settings → Controller**.

| Action | Keyboard | Controller |
| --- | --- | --- |
| Move | Arrow keys | D-pad or left stick |
| Select, play, or install | Enter | A, or the controller's bottom face button |
| Back | Esc | B, or the right face button |
| Open game options | O | X, or the left face button |
| Search | / | Y, or the top face button |
| Switch tabs | Q / E | LB / RB |
| Full screen | F11 | View |
| Settings | F1 | Menu |
| Scroll | Mouse wheel | Right stick |

Press `↓` on a home-screen game to open its hub and `↑` to move to the header.
Press `1`, `2`, or `3` to open Games, Library, or Store. `I` opens installed games,
`F5` reloads, and `Ctrl+Q` quits.

When rebinding an action, `Esc` cancels and `Delete` clears the binding.
Each action can have a primary and an alternate binding.

## Build from source

Install the Go version declared in [go.mod](go.mod) and
[Bun](https://bun.sh) at the version declared in [package.json](package.json).
Linux builds need GTK 3 and WebKitGTK 4.1 to run, but compilation does not need their development headers.

```sh
git clone https://github.com/qepo17/sit-and-play.git
cd sit-and-play
bun install --frozen-lockfile
bun run dev
```

On Ubuntu or Debian, install the runtime library before opening the desktop app:

```sh
sudo apt install libwebkit2gtk-4.1-0
```

To preview the frontend with demo games in a browser, run `bun run dev:web`.
To create production packages, run:

```sh
bun run build
```

Packages appear in `build/<os>-<arch>/`. The frontend is embedded in the executable.
MyGo generates the TypeScript bindings as part of the build.

GitHub Actions checks every PR and builds both Windows and Linux packages.
The **Build** workflow also supports manual runs. Download its packages from the run's Artifacts section.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and PR guidelines.
Report bugs and suggest features through [GitHub Issues](https://github.com/qepo17/sit-and-play/issues).
Use [SECURITY.md](SECURITY.md) to report vulnerabilities privately.
Maintainers can follow the [release guide](docs/RELEASING.md).

## License

Sit and Play's code is available under the [MIT license](LICENSE).
Bundled fonts and dependencies keep their own licenses, listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Steam, game names, and game artwork belong to their respective owners.
