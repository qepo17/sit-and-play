package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

//go:embed catalog.json
var catalogJSON []byte

// Art describes a game's generated cover: a disc and a band over a
// background color, positioned in percent of the cover.
type Art struct {
	Bg  string  `json:"bg"`
	A1  string  `json:"a1"`
	A2  string  `json:"a2"`
	Cx  float64 `json:"cx"`
	Cy  float64 `json:"cy"`
	Rot float64 `json:"rot"`
}

// Achievement is one achievement shown in a game's hub.
type Achievement struct {
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	Unlocked bool   `json:"unlocked"`
}

// AddOn is downloadable content the user owns for a game.
type AddOn struct {
	Title    string `json:"title"`
	BoughtOn string `json:"boughtOn"`
	Price    int    `json:"price"`
	Note     string `json:"note,omitempty"`
	// Art is the thumbnail's shape: "orb" or "band".
	Art string `json:"art"`
}

// News is a news item of a game.
type News struct {
	Tag   string `json:"tag"`
	Title string `json:"title"`
	When  string `json:"when"`
}

// Game is a game in the user's library. Prices are in rupiah, dates are
// YYYY-MM-DD.
type Game struct {
	ID                   string        `json:"id"`
	Title                string        `json:"title"`
	Genre                string        `json:"genre"`
	Blurb                string        `json:"blurb"`
	Art                  Art           `json:"art"`
	PurchasedOn          string        `json:"purchasedOn"`
	PricePaid            int           `json:"pricePaid"`
	StorePriceThen       int           `json:"storePriceThen"`
	StorePriceNow        int           `json:"storePriceNow"`
	Installed            bool          `json:"installed"`
	SizeGB               float64       `json:"sizeGB"`
	Controller           bool          `json:"controller"`
	CloudSaves           bool          `json:"cloudSaves"`
	Hours                float64       `json:"hours"`
	RecentHours          float64       `json:"recentHours"`
	FirstPlayed          string        `json:"firstPlayed"`
	LastPlayed           time.Time     `json:"lastPlayed"`
	AchievementsUnlocked int           `json:"achievementsUnlocked"`
	AchievementsTotal    int           `json:"achievementsTotal"`
	Achievements         []Achievement `json:"achievements"`
	AddOns               []AddOn       `json:"addOns"`
	News                 []News        `json:"news"`
}

// catalogEntry is a game of catalog.json, which dates its last session
// relative to the first launch.
type catalogEntry struct {
	Game
	LastPlayedDaysAgo int `json:"lastPlayedDaysAgo"`
}

// savedState is what the library keeps between launches.
type savedState struct {
	Selected   string               `json:"selected"`
	LastPlayed map[string]time.Time `json:"lastPlayed"`
	Installed  map[string]bool      `json:"installed,omitempty"`
}

// Library is the user's game collection, with the game selected on the
// home screen and when each game was last played.
type Library struct {
	mu    sync.Mutex
	path  string // the saved state; "" until the app is ready
	games []Game
	state savedState
}

func newLibrary() *Library {
	var entries []catalogEntry
	if err := json.Unmarshal(catalogJSON, &entries); err != nil {
		panic(fmt.Sprintf("catalog.json: %v", err))
	}
	l := &Library{state: savedState{LastPlayed: map[string]time.Time{}, Installed: map[string]bool{}}}
	now := time.Now()
	for _, e := range entries {
		e.Game.LastPlayed = now.AddDate(0, 0, -e.LastPlayedDaysAgo)
		l.games = append(l.games, e.Game)
	}
	l.state.Selected = l.games[0].ID
	return l
}

// load reads the saved state from path and keeps saving there.
func (l *Library) load(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.path = path
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		// First launch: remember the catalog's sessions as they are now.
		for _, g := range l.games {
			l.state.LastPlayed[g.ID] = g.LastPlayed
		}
		return l.saveLocked()
	}
	if err != nil {
		return err
	}
	var s savedState
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	if l.indexLocked(s.Selected) >= 0 {
		l.state.Selected = s.Selected
	}
	for i, g := range l.games {
		if t, ok := s.LastPlayed[g.ID]; ok {
			l.games[i].LastPlayed = t
		}
		if s.Installed[g.ID] {
			l.games[i].Installed = true
			l.state.Installed[g.ID] = true
		}
		l.state.LastPlayed[g.ID] = l.games[i].LastPlayed
	}
	return nil
}

func (l *Library) saveLocked() error {
	if l.path == "" {
		return nil
	}
	data, err := json.MarshalIndent(l.state, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(l.path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(l.path, data, 0o644)
}

func (l *Library) indexLocked(id string) int {
	return slices.IndexFunc(l.games, func(g Game) bool { return g.ID == id })
}

// Games returns every game in the library, in the order of the home row.
func (l *Library) Games() []Game {
	l.mu.Lock()
	defer l.mu.Unlock()
	return slices.Clone(l.games)
}

// Selected returns the ID of the game selected on the home screen.
func (l *Library) Selected() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state.Selected
}

// Select makes the game with the given ID the selected one, which the home
// screen shows at the next launch too.
func (l *Library) Select(id string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.indexLocked(id) < 0 {
		return fmt.Errorf("no game %q", id)
	}
	if l.state.Selected == id {
		return nil
	}
	l.state.Selected = id
	return l.saveLocked()
}

// Install installs the game with the given ID and returns it.
func (l *Library) Install(id string) (Game, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	i := l.indexLocked(id)
	if i < 0 {
		return Game{}, fmt.Errorf("no game %q", id)
	}
	l.games[i].Installed = true
	l.state.Installed[id] = true
	return l.games[i], l.saveLocked()
}

// Play starts a session of the game with the given ID and returns the game
// with its last session updated.
func (l *Library) Play(id string) (Game, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	i := l.indexLocked(id)
	if i < 0 {
		return Game{}, fmt.Errorf("no game %q", id)
	}
	g := &l.games[i]
	if !g.Installed {
		return Game{}, fmt.Errorf("%s is not installed", g.Title)
	}
	g.LastPlayed = time.Now()
	l.state.LastPlayed[id] = g.LastPlayed
	return *g, l.saveLocked()
}

// Store opens the Steam store, which is not part of the app.
type Store struct{}

// Open shows the Steam store in the default browser.
func (Store) Open() error {
	return mygo.Shell.OpenExternal("https://store.steampowered.com/")
}
