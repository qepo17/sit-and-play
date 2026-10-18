# AGENTS.md

Sit and Play is a controller-friendly desktop launcher for a player's Steam library, for Windows and Linux on x86-64.
It is a [MyGo](https://github.com/egoist/mygo) app: Go services in the root `main` package read local Steam files and Steam's web APIs, and a TypeScript frontend built with Vite calls them through generated bindings.

## Commands

- `bun install --frozen-lockfile`: after cloning or when `bun.lock` changes.
- `bun run dev`: opens the desktop app with live reload. Linux needs GTK 3 and WebKitGTK 4.1, and WSL needs a graphical session such as WSLg.
- `bun run dev:web`: serves the frontend with demo games at `http://localhost:5173`. It skips Steam discovery, native windows and game launching.
- `bun run generate`: after changing a bound Go service, an event or a type it returns. It rewrites `src/mygo.ts`.
- `gofmt -w *.go`: before committing Go. CI fails on any file that `gofmt -l` lists.
- `CGO_ENABLED=0 go test ./...` and `go vet ./...`: after Go changes. CI tests with cgo disabled on Linux and Windows.
- `bun run typecheck`: after TypeScript changes.
- `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12`: after editing `.github/workflows/`.
- `bun run build` (or `bun run build -platform linux/amd64` or `windows/amd64`): builds packages into `build/<os>-<arch>/`.
- Run this gate before you push. It matches CI:

  ```sh
  gofmt -w *.go
  go mod verify
  CGO_ENABLED=0 go test ./...
  go vet ./...
  bun run typecheck
  bun run generate
  git diff --exit-code -- src/mygo.ts
  bun run build
  ```

## Principles

- **KISS / YAGNI**: the frontend has no UI framework. Views are functions that return HTML strings (`src/views/*.ts`), and all Go code is one `main` package with files split by concern. Extend these rather than adding a framework, package or lint stack for one feature. (source: https://java-design-patterns.com/principles/)
- **DRY**: the Go types are the single source for the API. `src/mygo.ts` is generated from them, and `src/api.ts` re-exports its types. The version lives only in `package.json`: `mygo.config.ts` imports it, and the Release workflow checks the tag against it. (source: https://java-design-patterns.com/principles/)
- **Separation of Concerns**: `local.go` and `vdf.go` read Steam's files. `steam.go` and `art.go` talk to Steam over the network. `library.go` holds the services and saved state. `src/main.ts` does routing and calls the services, and `src/views/` only renders. Keep slow I/O out of rendering. (source: https://java-design-patterns.com/principles/)
- **SOLID**: dependencies go in as struct fields, never as globals: `steamAPI` takes `base`, `store`, `assets` and `client`, and `Store` takes `launch`. Tests swap in `httptest` servers through those fields. Follow that pattern for new dependencies rather than adding interfaces for mocking. (source: https://en.wikipedia.org/wiki/SOLID)
- **Parse, don't validate**: turn untrusted input into typed values once, at the boundary. `vdf.go` parses Steam's text files, `steam.go` decodes JSON into structs, and `steamAPI.steamID` turns a profile URL into an ID. Downstream code then uses those types. (source: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- **Fail fast**: bound methods return errors, and the frontend shows them through `showError`. Don't fall back to defaults that hide a failure. `mygo.Bind` panics at startup on bad method signatures, and the Release workflow stops when the tag and the changelog don't match the version. (source: https://martinfowler.com/ieeeSoftware/failFast.pdf)
- **Least privilege**: workflows default to `permissions: contents: read` and `persist-credentials: false`. Only the release upload job gets `contents: write`, and only `v*` tag builds see `MYGO_UPDATER_PRIVATE_KEY`. The Steam Web API key lives in plain text in `library.json`, so keep it out of logs and errors. (source: https://en.wikipedia.org/wiki/Principle_of_least_privilege)
- **Small batches**: keep each PR to one problem, and CI checks every PR to `main`. A release is its own small PR that bumps the version and changelog, followed by a tag on the merge commit. (source: https://martinfowler.com/articles/continuousIntegration.html)

## Do

### General
- Add changes that players notice to `## Unreleased` in `CHANGELOG.md`, as plain `- ` items under `### Added`, `### Changed` or `### Fixed`. Write them for players. The app shows them as update notes, and other Markdown is not rendered.
- After changing a bound service, run `bun run generate` and commit `src/mygo.ts`. Bound services are `Library`, `Store`, `App` and `Updates`, including their exported methods, their argument and result types, and `mygo.NewEvent` events.
- Update `browserApi()` in `src/api.ts` whenever a service changes, so `bun run dev:web` keeps working.
- Test behavior changes with `fakeSteam` in `library_test.go`, which uses temporary Steam directories and local `httptest` servers. Tests must not need a real Steam account, network access to Steam or an API key.
- Commit `go.sum` or `bun.lock` together with the manifest changes. Keep `github.com/egoist/mygo`, `mygo-cli` and `mygo-runtime` at compatible versions, currently 0.3.4 each.
- When changing shipped dependencies or fonts, review `licenses/` and `THIRD_PARTY_NOTICES.md`.
- For UI changes, inspect the rendered result in `bun run dev:web` or `bun run dev`. Check the flow with the keyboard and, when available, a controller. Include screenshots in the PR.
- Give every new action a keyboard binding in `src/shortcuts.ts` and a controller binding in `src/gamepad.ts`.
- Update `README.md`, `CONTRIBUTING.md` or `docs/` when commands or user-facing behavior change.
- Write commit subjects as an imperative sentence about the behavior, as in `Show only installed games on the home screen`.
- Pin new GitHub Actions to a full commit SHA with a `# vX.Y.Z` comment, and set `persist-credentials: false` on checkout.
- Release by following `docs/RELEASING.md`.

### Go
- Accept `ctx context.Context` first in bound methods that do I/O, and pass it to `http.NewRequestWithContext`. MyGo cancels it when the page navigates away or the window closes.
- Guard service state with a named `mu sync.Mutex` field. MyGo runs each bound call on its own goroutine, so calls run concurrently.
- Write error messages for players, because the frontend shows the text unchanged. Start them lowercase unless they begin with a proper noun, add short context, and wrap with `%w` at the end, as in `fmt.Errorf("Steam client: %w", err)`.
- Check errors with `errors.Is` or `errors.As`, as in `errors.Is(err, fs.ErrNotExist)`. Don't compare error text.
- Give every field that crosses to the page a camelCase `json` tag. Use `omitempty` or `omitzero` for optional fields, which become `field?:` in TypeScript.
- Keep Steam IDs and other values above 2^53 as strings.
- Write a doc comment on every exported type, field and method. `mygo generate` copies them into TSDoc.
- Put work that must not run during `mygo generate` inside `mygo.App.WhenReady`. Generate runs `main` up to `App.Run`.
- Give each `http.Client` a timeout, as in `&http.Client{Timeout: 20 * time.Second}`.
- When you change shared state and a C toolchain is available, run `CGO_ENABLED=1 go test -race ./...`.

### TypeScript
- Pass every interpolated value in view HTML through `esc()` from `src/format.ts`. Views are assigned to `innerHTML`, and game data comes from Steam.
- Handle every promise from a service call: `await` it in `try`/`catch` and call `showError`, or chain `.catch(showError)`. Use `void` only when the function already handles its own errors, like `loadDetails`.
- Import service types and calls from `./api` (or `../api`). Only `src/api.ts` imports `./mygo`, because it swaps in the browser demo.
- Narrow index reads with a check, because `noUncheckedIndexedAccess` is on. Keep `!` for invariants the code guarantees, such as `#app` existing.
- Model variants as string-literal unions, like `Route` and `UpdateStatus.state`, and `switch` on them.
- Use `import type` or inline `type` specifiers for type-only imports, and use named exports.

## Don't

### General
- Don't edit `src/mygo.ts` by hand. Change the Go code and run `bun run generate` instead.
- Don't commit API keys, `library.json`, account details, signing certificates (`*.pfx`, `*.p12`) or `mygo-update.key`. Use fake fixtures such as `testSteamID` instead, and redact logs and screenshots.
- Don't change the app identifier `io.github.qepo17.sitandplay`, the app name `Sit and Play` or `updates.publicKey` in `mygo.config.ts`. A new name moves the user-data directory, and a new key stops every installed copy from updating. Raise such a change in an issue instead.
- Don't set the version anywhere other than `package.json`.
- Don't check changes to Steam discovery, Play or Install only in `bun run dev:web`, because the demo fakes them. Test them in `bun run dev` instead.

### Go
- Don't log an error and also return it. Handle it once: return it to the page, or log it where nothing can return it, as `main.go` and `updates.go` do.
- Don't store a `context.Context` in a struct. Pass it to each call instead.
- Don't panic or call `log.Fatal` outside `main` for ordinary failures. Return an error instead.
- Don't start a goroutine without a clear end. Tie it to the call's `ctx` or to the app's lifetime, and say which in a comment.
- Don't add interfaces or package-level mutable state for testing. Inject URLs, clients or functions as fields instead.
- Don't depend on cgo. Builds and CI use `CGO_ENABLED=0`.

### TypeScript
- Don't use `any` or `@ts-ignore`. Use `unknown` and narrow it, or fix the type.
- Don't call services or do I/O in `src/views/`. Load data in `src/main.ts` and pass it to the view functions.
- Don't add tsconfig options that TypeScript 7 removed (`baseUrl`, `moduleResolution: "node"`, `esModuleInterop: false`, `target: "es5"`). Keep `moduleResolution: "bundler"`.
- Don't rely on implicit `@types` globals. TypeScript 7 defaults `types` to `[]`, so add each package to `types`.

## Notes

- The pinned versions are Go 1.27.1 (`go.mod`), Bun 1.4.2 (`packageManager`), TypeScript 7.0.2, Vite 8.3.4 and MyGo 0.3.4, all from `bun.lock`.
- TypeScript 7 has no stable programmatic API. A tool that needs one, such as typescript-eslint, needs the `@typescript/typescript6` alias. The repository has no linter or formatter for TypeScript, so match the surrounding style: double quotes, semicolons, trailing commas and lines of about 120 columns.
- `vite.config.ts` uses `strictPort: true` on port 5173, the `devUrl` in `mygo.config.ts`. If something else uses that port, `bun run dev:web` fails rather than moving to another port.
- `STEAM_DIR` overrides where `local.go` looks for Steam. Under WSL, it finds Steam for Windows under `/mnt/c`.
- The MyGo source for the pinned version is at `go list -m -f '{{.Dir}}' github.com/egoist/mygo`. Read its `docs/` before you use an API.
- The `ui` package rules in `.agents/skills/mygo-maintenance/SKILL.md` don't apply here, because this app uses a web frontend.
- `promo/` is a separate Rust project (edition 2024, `fframes` =1.2.0) for the README GIF, and CI doesn't build it. Its commands are in `promo/README.md`. Files under `media/` are embedded at compile time, so run `touch src/lib.rs` after changing them.
