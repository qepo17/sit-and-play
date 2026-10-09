# Prepare and publish a release

The Release workflow builds Windows and Linux x86-64 packages when you push a `v*` tag.
It runs the same checks as PR CI, then creates a draft GitHub release with the packages and `SHA256SUMS`.
Only the final upload job has `contents: write` permission.
No signing credentials are required for the current unsigned builds.

## Prepare the public launch

Complete these repository settings before launch:

- Enable GitHub Actions and allow the actions referenced by the workflows.
- Enable Issues and private vulnerability reporting.
- Protect `main` with PR review and the CI source checks and both platform package checks.
  Select the check names after the first successful CI run.
- Review tracked files and Git history for credentials and private data before changing repository visibility.
- Confirm the project license and the rights to bundled assets.
- Set a repository description and topics so visitors can find the project.

The app identifier is `io.github.qepo17.sitandplay`. Keep it stable after launch.
Earlier development builds used the app name `Steam Library`.
MyGo stores user data by app name, so `Sit and Play` uses a new directory and does not migrate settings automatically.
To keep development settings, close both builds and copy `library.json` from the `Steam Library` directory
to the `Sit and Play` directory before starting the new build.
Those directories are under `%APPDATA%` on Windows and `$XDG_CONFIG_HOME` on Linux, which defaults to `~/.config`.
If the new directory already contains settings, back them up before replacing its file.

## Create a release

1. Update `version` in `package.json`, which `mygo.config.ts` uses for every package.
   Use `MAJOR.MINOR.PATCH`, or a prerelease such as `0.2.0-beta.1`.
2. Open a PR with the version change and any documentation changes.
3. Wait for CI and merge the PR into `main`.
4. Update your local checkout and tag the merged commit. For version `0.1.0`, run:

   ```sh
   git switch main
   git pull --ff-only origin main
   git tag -a v0.1.0 -m "Sit and Play 0.1.0"
   git push origin v0.1.0
   ```

5. Wait for the [Release workflow](https://github.com/qepo17/sit-and-play/actions/workflows/release.yml) to finish.
   The tag must match the version in `package.json` or the workflow fails before building.
6. Open the draft on [GitHub Releases](https://github.com/qepo17/sit-and-play/releases).
   Review the generated notes and explain known limitations or upgrade steps.
7. Download and test the Windows installer and a Linux package on their target systems.
   Check Steam detection, game launching, keyboard navigation, controller input, and uninstall behavior.
8. Publish the draft after those checks pass.

Tags with a version suffix create prereleases. Published packages do not update themselves automatically.
Users install a new release manually.

## Check the downloads

Each release contains these files, with its version substituted:

| File | Purpose |
| --- | --- |
| `Sit and Play Setup <version>.exe` | Windows installer |
| `sit-and-play_<version>_amd64.deb` | Debian and Ubuntu package |
| `sit-and-play-<version>-linux-amd64.tar.gz` | Linux app and resources |
| `install.sh` | Per-user Linux installer, downloaded alongside the archive |
| `SHA256SUMS` | SHA-256 checksums for the packages |

Download `SHA256SUMS` and the packages into the same directory.
On Linux, verify them with:

```sh
sha256sum --check SHA256SUMS
```

On Windows, calculate the installer's hash with PowerShell and compare it with its entry in `SHA256SUMS`:

```powershell
Get-FileHash ".\Sit and Play Setup 0.1.0.exe" -Algorithm SHA256
```

The Windows build is unsigned and may trigger SmartScreen.
Code signing needs a publisher certificate or a signing service and a separate configuration change.
The Linux packages need GTK 3 and WebKitGTK 4.1 at runtime.

## Recover a failed release

Re-run failed jobs from the Actions page. Packages are uploaded only after both builds pass.
Re-running the full workflow replaces assets on an existing draft.
The workflow refuses to replace assets on a published release.
For a fix to a published release, bump the version and create a new tag.

## Build without releasing

Run the Build workflow manually from the Actions page, or open a PR.
Download `packages-windows-amd64` and `packages-linux-amd64` from the run's Artifacts section.
These artifacts expire after 14 days.

To build locally, use:

```sh
bun install --frozen-lockfile
bun run build -platform linux/amd64
bun run build -platform windows/amd64
```

MyGo downloads NSIS automatically on Windows. To create the Windows installer on Linux,
install NSIS first with `sudo apt install nsis`.
