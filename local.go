package main

import (
	"encoding/base64"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

// steamClient is the Steam client installed on this computer, which knows
// the games installed and played here without a Web API key.
type steamClient struct {
	dir string // "" when there is none
}

// localApp is what the Steam client knows of an app.
type localApp struct {
	Name        string
	Installed   bool
	Size        int64 // bytes on disk
	LastPlayed  time.Time
	Minutes     int // played in total
	Minutes2Wks int // played in the last two weeks
}

// findSteamClient returns the Steam client of this computer. $STEAM_DIR
// overrides where it's looked for.
func findSteamClient() steamClient {
	if dir := os.Getenv("STEAM_DIR"); dir != "" {
		return steamClient{dir}
	}
	home, _ := os.UserHomeDir()
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		candidates = []string{filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam"), `C:\Program Files (x86)\Steam`}
	case "darwin":
		candidates = []string{filepath.Join(home, "Library", "Application Support", "Steam")}
	default:
		candidates = []string{
			filepath.Join(home, ".steam", "steam"),
			filepath.Join(home, ".local", "share", "Steam"),
			filepath.Join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
			// The Windows client, seen from WSL.
			"/mnt/c/Program Files (x86)/Steam",
		}
	}
	for _, dir := range candidates {
		if _, err := os.Stat(filepath.Join(dir, "config")); err == nil {
			return steamClient{dir}
		}
	}
	return steamClient{}
}

// wsl tells whether the client is Steam for Windows seen from WSL.
func (c steamClient) wsl() bool {
	return runtime.GOOS == "linux" && strings.HasPrefix(c.dir, "/mnt/")
}

// hostPath returns a path of the client's files as this computer sees it.
func (c steamClient) hostPath(p string) string {
	if c.wsl() && len(p) >= 3 && p[1] == ':' && (p[2] == '\\' || p[2] == '/') {
		return "/mnt/" + strings.ToLower(p[:1]) + "/" + strings.ReplaceAll(p[3:], `\`, "/")
	}
	return p
}

// user returns the SteamID64 and the name of the account last signed in to
// the client, or "" for none.
func (c steamClient) user() (steamID, name string) {
	if c.dir == "" {
		return "", ""
	}
	users, err := readVDF(filepath.Join(c.dir, "config", "loginusers.vdf"))
	if err != nil {
		return "", ""
	}
	var latest string
	for id, u := range users.section("users") {
		u, _ := u.(vdf)
		if u.str("MostRecent") == "1" {
			return id, u.str("PersonaName")
		}
		// Timestamps are Unix seconds, of the same length for centuries.
		if t := u.str("Timestamp"); steamID == "" || t > latest {
			steamID, name, latest = id, u.str("PersonaName"), t
		}
	}
	return steamID, name
}

// avatar returns the avatar of an account that the client keeps, as a
// data: URL, or "".
func (c steamClient) avatar(steamID string) string {
	if c.dir == "" || steamID == "" {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(c.dir, "config", "avatarcache", steamID+".png"))
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

// apps returns the apps installed in the client's libraries and those the
// account played, by app ID.
func (c steamClient) apps(steamID string) (map[string]localApp, error) {
	apps := map[string]localApp{}
	if c.dir == "" {
		return apps, nil
	}
	folders, err := readVDF(filepath.Join(c.dir, "steamapps", "libraryfolders.vdf"))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	for _, f := range folders.section("libraryfolders") {
		f, _ := f.(vdf)
		root := c.hostPath(f.str("path"))
		installed := f.section("apps")
		for id := range installed {
			app := localApp{Installed: true, Size: installed.int(id)}
			if m, err := readVDF(filepath.Join(root, "steamapps", "appmanifest_"+id+".acf")); err == nil {
				m := m.section("AppState")
				app.Name = m.str("name")
				app.LastPlayed = unixTime(m.int("LastPlayed"))
				// Flag 4 is "fully installed"; without it Steam is still
				// downloading the app.
				app.Installed = m.int("StateFlags")&4 != 0
				if n := m.int("SizeOnDisk"); n > 0 {
					app.Size = n
				}
			}
			apps[id] = app
		}
	}

	if steamID == "" {
		return apps, nil
	}
	n, err := strconv.ParseUint(steamID, 10, 64)
	if err != nil {
		return apps, nil
	}
	// The client keeps each account's data under its 32-bit account ID.
	const individualBase = 76561197960265728
	config, err := readVDF(filepath.Join(c.dir, "userdata", strconv.FormatUint(n-individualBase, 10), "config", "localconfig.vdf"))
	if errors.Is(err, fs.ErrNotExist) {
		return apps, nil
	}
	if err != nil {
		return nil, err
	}
	played := config.section("UserLocalConfigStore").section("Software").section("Valve").section("Steam").section("apps")
	for id, p := range played {
		p, _ := p.(vdf)
		app := apps[id]
		app.LastPlayed = latest(app.LastPlayed, unixTime(p.int("LastPlayed")))
		app.Minutes, app.Minutes2Wks = int(p.int("Playtime")), int(p.int("Playtime2wks"))
		apps[id] = app
	}
	return apps, nil
}

// unixTime returns the time of Unix seconds, zero for 0.
func unixTime(n int64) time.Time {
	if n <= 0 {
		return time.Time{}
	}
	return time.Unix(n, 0)
}

// open hands a steam:// URL, such as steam://rungameid/620, to the client,
// which starts if it isn't running.
func (c steamClient) open(u string) error {
	if exe := filepath.Join(c.dir, "steam.exe"); c.wsl() {
		// WSL runs Windows programs; it has no handler for steam:// URLs.
		cmd := exec.Command(exe, u)
		if err := cmd.Start(); err != nil {
			return err
		}
		go cmd.Wait()
		return nil
	}
	return mygo.Shell.OpenExternal(u)
}
