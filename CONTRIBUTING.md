# Contribute to Sit and Play

Check [existing issues](https://github.com/qepo17/sit-and-play/issues) before opening a new one.
For a large feature or a dependency upgrade that changes MyGo APIs, discuss the approach in an issue first.
Small fixes and documentation improvements can go straight to a PR.

## Set up development

1. Fork the repository and clone your fork.
2. Install the Go version in `go.mod` and the Bun version in `package.json`.
3. Run `bun install --frozen-lockfile`.
4. Create a branch for your change.
5. Run `bun run dev` to open the desktop app with live reload.

On Linux, install GTK 3 and WebKitGTK 4.1 before opening the app.
On Debian or Ubuntu, run `sudo apt install libwebkit2gtk-4.1-0`.
On Windows, install the Microsoft Edge WebView2 Runtime if it is missing.

`bun run dev:web` opens a browser-only frontend with demo games.
It does not exercise Steam discovery, native window behavior, or game launching.

## Find the code

| Path | Responsibility |
| --- | --- |
| `main.go` | App lifecycle, window, and native app commands |
| `library.go` | Library and Store services, saved state, and settings |
| `local.go`, `vdf.go` | Steam discovery and local Steam files |
| `steam.go`, `art.go` | Steam API, store data, and artwork colors |
| `library_test.go` | Local Steam fixtures and HTTP integration tests |
| `src/main.ts` | Frontend routing and actions |
| `src/shortcuts.ts`, `src/gamepad.ts` | Keyboard commands and controller input |
| `src/views/`, `src/style.css` | Screen rendering and styles |
| `src/mygo.ts` | Generated Go service bindings |
| `src/demo-games.json` | Browser demo fixtures |
| `mygo.config.ts` | App identity and packaging |

## Make a change

Keep PRs focused on one problem. Follow the existing Go and TypeScript conventions.
Keep slow network and file operations out of UI rendering and preserve keyboard and controller navigation.

Add changes that players notice to the `## Unreleased` section of `CHANGELOG.md`.
Write them as plain `- ` list items under `### Added`, `### Changed`, or `### Fixed`.
The app shows these notes when it updates, without other Markdown formatting.

After changing a bound Go service, run `bun run generate` and commit any changes to `src/mygo.ts`.
Do not edit that generated file by hand.

Add tests for behavior changes using the existing temporary Steam directories and local HTTP servers.
Tests must not need a real Steam account, network access to Steam, or an API key.
Documentation-only changes do not need new tests.

When updating dependencies, commit `go.sum` or `bun.lock` with the manifest changes.
Keep `github.com/egoist/mygo`, `mygo-cli`, and `mygo-runtime` at compatible versions.
Review the bundled notices in `licenses/` when changing shipped dependencies.

## Verify your change

Run these commands from the repository root:

```sh
gofmt -w *.go
go mod verify
go test ./...
go vet ./...
bun run typecheck
bun run generate
git diff --exit-code -- src/mygo.ts
bun run build
```

If generation changes the bindings, review and commit them before checking for a clean diff.
MyGo builds with `CGO_ENABLED=0` by default. CI tests Go with the same setting on Windows and Linux.

For UI changes, inspect the rendered interface in the browser preview or desktop app.
Check the affected flow with the keyboard and, when available, a controller.
Include screenshots and explain any platform or controller checks you could not run.
Test native Steam actions in the desktop app when your change affects them.

## Open a PR

Explain the problem, the resulting behavior, and how you verified the change.
Link the related issue and update documentation when commands or user behavior change.
CI checks formatting, modules, TypeScript, and generated bindings, then tests and packages both supported platforms.

Do not commit API keys, `library.json`, account details, signing certificates, or private update keys.
Redact logs and screenshots before posting them.
Follow [SECURITY.md](SECURITY.md) for vulnerability reports.

Treat other contributors with respect. Give feedback about the code and behavior, and explain your reasoning.
By submitting a contribution, you agree to license your contribution under the project's [MIT license](LICENSE).
