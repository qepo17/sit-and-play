package main

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"log"
	"maps"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

// Art describes a game's generated art: a disc and a band over a
// background color, positioned in percent of the cover. Its colors are
// those of the game's store picture.
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
	Title      string    `json:"title"`
	Detail     string    `json:"detail"`
	Unlocked   bool      `json:"unlocked"`
	UnlockedAt time.Time `json:"unlockedAt,omitzero"`
}

// News is a news item of a game.
type News struct {
	Tag   string    `json:"tag"`
	Title string    `json:"title"`
	When  time.Time `json:"when"`
	URL   string    `json:"url"`
}

// Price is a game's price in the Steam store today, formatted in the
// currency of the account's country.
type Price struct {
	// Now is the price, "Free", or "" when the store doesn't sell the game.
	Now string `json:"now"`
	// Before is the price before the current discount, if any.
	Before   string `json:"before,omitempty"`
	Discount int    `json:"discount,omitempty"`
}

// Game is a game of the Steam account. Dates are YYYY-MM-DD.
type Game struct {
	ID    string `json:"id"` // the Steam app ID
	Title string `json:"title"`
	Genre string `json:"genre"`
	Blurb string `json:"blurb"`
	Art   Art    `json:"art"`
	// Cover is the URL of the portrait library picture, Hero the URL of
	// the wide one; either may be missing or fail to load.
	Cover       string    `json:"cover,omitempty"`
	Hero        string    `json:"hero,omitempty"`
	Developer   string    `json:"developer"`
	Publisher   string    `json:"publisher"`
	Released    string    `json:"released,omitempty"`
	Price       Price     `json:"price"`
	Installed   bool      `json:"installed"`
	SizeGB      float64   `json:"sizeGB"`
	Controller  bool      `json:"controller"`
	CloudSaves  bool      `json:"cloudSaves"`
	Hours       float64   `json:"hours"`
	RecentHours float64   `json:"recentHours"`
	LastPlayed  time.Time `json:"lastPlayed,omitzero"`
	// Detailed tells whether the art's colors, the achievements and the
	// news are loaded; Library.Details loads them.
	Detailed             bool          `json:"detailed"`
	AchievementsUnlocked int           `json:"achievementsUnlocked"`
	AchievementsTotal    int           `json:"achievementsTotal"`
	Achievements         []Achievement `json:"achievements"`
	News                 []News        `json:"news"`

	header   string // the store's header picture, for the art's colors
	hasStats bool
}

// Account is the Steam account whose games the library shows.
type Account struct {
	// Connected tells whether the account is connected with a Web API
	// key, which adds the games not played on this computer and the
	// achievements. Otherwise the account is the one signed in to the
	// Steam client.
	Connected bool   `json:"connected"`
	SteamID   string `json:"steamID"`
	Name      string `json:"name"`
	Avatar    string `json:"avatar"`
	// Client tells whether the Steam client is installed on this computer.
	Client bool `json:"client"`
}

// savedState is what the library keeps between launches.
type savedState struct {
	APIKey   string `json:"apiKey,omitempty"`
	SteamID  string `json:"steamID,omitempty"`
	Selected string `json:"selected"`
	// LastPlayed has the sessions started from the app, which Steam
	// reports only once they end.
	LastPlayed map[string]time.Time `json:"lastPlayed"`
	// Shortcuts has the keys of the keyboard commands the user changed,
	// by command.
	Shortcuts map[string][]string `json:"shortcuts,omitempty"`
	// StartFullScreen opens the app in full screen.
	StartFullScreen bool `json:"startFullScreen,omitempty"`
}

// details is what Library.Details adds to a game.
type details struct {
	art                  Art
	achievementsUnlocked int
	achievementsTotal    int
	achievements         []Achievement
	news                 []News
}

func (d details) apply(g *Game) {
	g.Detailed = true
	g.Art = d.art
	g.AchievementsUnlocked, g.AchievementsTotal = d.achievementsUnlocked, d.achievementsTotal
	g.Achievements, g.News = d.achievements, d.news
}

// Library is the user's Steam games, with the game selected on the home
// screen. The Steam client of this computer tells which are installed and
// played; the store describes them.
type Library struct {
	newAPI func(key string) *steamAPI
	client steamClient
	launch func(url string) error // opens steam:// URLs

	loading sync.Mutex // held while Games runs, so the store is asked once

	mu      sync.Mutex
	path    string // the saved state; "" until the app is ready
	state   savedState
	api     *steamAPI   // with the key of the connected account
	player  steamPlayer // the connected account; zero until asked
	owned   []ownedGame // the connected account's games; nil until asked
	store   map[int]storeItem
	prices  map[int]Price
	tags    map[int]string
	details map[string]details
	games   []Game // as Games last returned them
}

func newLibrary() *Library {
	client := findSteamClient()
	l := &Library{
		newAPI: newSteamAPI,
		client: client,
		launch: client.open,
		state:  savedState{LastPlayed: map[string]time.Time{}},
	}
	l.api = l.newAPI("")
	l.resetLocked()
	return l
}

// resetLocked forgets what was asked of Steam for an account.
func (l *Library) resetLocked() {
	l.player, l.owned, l.games = steamPlayer{}, nil, nil
	l.store, l.prices, l.details = map[int]storeItem{}, map[int]Price{}, map[string]details{}
}

// load reads the saved state from path and keeps saving there.
func (l *Library) load(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.path = path
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var s savedState
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	if s.LastPlayed == nil {
		s.LastPlayed = map[string]time.Time{}
	}
	if s.APIKey == "" || s.SteamID == "" {
		s.APIKey, s.SteamID = "", ""
	}
	l.state = s
	l.api = l.newAPI(s.APIKey)
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
	if err := os.MkdirAll(filepath.Dir(l.path), 0o700); err != nil {
		return err
	}
	// The file has the Web API key.
	return os.WriteFile(l.path, data, 0o600)
}

func (l *Library) indexLocked(id string) int {
	return slices.IndexFunc(l.games, func(g Game) bool { return g.ID == id })
}

// Account returns the account whose games the library shows.
func (l *Library) Account(ctx context.Context) (Account, error) {
	l.mu.Lock()
	api, steamID, player := l.api, l.state.SteamID, l.player
	l.mu.Unlock()
	a := Account{Client: l.client.dir != ""}
	if api.key == "" {
		a.SteamID, a.Name = l.client.user()
		a.Avatar = l.client.avatar(a.SteamID)
		return a, nil
	}
	if player.SteamID == "" {
		p, err := api.player(ctx, steamID)
		if err != nil {
			// Offline, say: the games of this computer still play.
			log.Printf("Steam account: %v", err)
		} else {
			player = p
			l.mu.Lock()
			if l.api == api {
				l.player = player
			}
			l.mu.Unlock()
		}
	}
	a.Connected, a.SteamID, a.Name = true, steamID, player.Name
	a.Avatar = cmp.Or(player.Avatar, l.client.avatar(steamID))
	return a, nil
}

// Connect connects a Steam account with a Web API key, from
// https://steamcommunity.com/dev/apikey. account is its SteamID64, its
// profile URL or the custom name in that URL; "" is the account signed in
// to the Steam client.
func (l *Library) Connect(ctx context.Context, apiKey, account string) (Account, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return Account{}, errors.New("enter your Steam Web API key")
	}
	if strings.TrimSpace(account) == "" {
		account, _ = l.client.user()
	}
	api := l.newAPI(apiKey)
	steamID, err := api.steamID(ctx, account)
	if err != nil {
		return Account{}, err
	}
	player, err := api.player(ctx, steamID)
	if err != nil {
		return Account{}, err
	}
	owned, err := api.ownedGames(ctx, steamID)
	if err != nil {
		return Account{}, err
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.resetLocked()
	l.api, l.player, l.owned = api, player, owned
	l.state.APIKey, l.state.SteamID = apiKey, steamID
	a := Account{Connected: true, SteamID: steamID, Name: player.Name, Avatar: player.Avatar, Client: l.client.dir != ""}
	return a, l.saveLocked()
}

// Disconnect forgets the connected account and its Web API key.
func (l *Library) Disconnect() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.resetLocked()
	l.api = l.newAPI("")
	l.state.APIKey, l.state.SteamID = "", ""
	return l.saveLocked()
}

// Games returns the games installed or played on this computer, and the
// other games of a connected account, the most recently played first.
func (l *Library) Games(ctx context.Context) ([]Game, error) {
	l.loading.Lock()
	defer l.loading.Unlock()
	l.mu.Lock()
	api, steamID, owned := l.api, l.state.SteamID, l.owned
	l.mu.Unlock()

	if api.key == "" {
		steamID, _ = l.client.user()
	}
	local, err := l.client.apps(steamID)
	if err != nil {
		return nil, fmt.Errorf("Steam client: %w", err)
	}
	if api.key != "" && owned == nil {
		if owned, err = api.ownedGames(ctx, steamID); err != nil {
			log.Printf("owned games: %v", err)
		}
	}
	var ids []int
	for id := range local {
		if n, err := strconv.Atoi(id); err == nil {
			ids = append(ids, n)
		}
	}
	for _, o := range owned {
		ids = append(ids, o.AppID)
	}
	l.askStore(ctx, api, ids)

	l.mu.Lock()
	defer l.mu.Unlock()
	if l.api != api {
		return nil, errors.New("the Steam account changed")
	}
	if owned != nil {
		l.owned = owned
	}
	l.games = l.gamesLocked(local)
	return slices.Clone(l.games), nil
}

// askStore gets what the store tells of the apps it wasn't asked about yet.
// The library does without what it can't get, offline for one.
func (l *Library) askStore(ctx context.Context, api *steamAPI, ids []int) {
	l.mu.Lock()
	var missing []int
	for _, id := range ids {
		if _, ok := l.store[id]; !ok {
			missing = append(missing, id)
		}
	}
	slices.Sort(missing)
	missing = slices.Compact(missing)
	needTags := l.tags == nil && len(missing) > 0
	country := l.player.CountryCode
	l.mu.Unlock()
	if len(missing) == 0 {
		return
	}

	items, err := api.storeItems(ctx, missing)
	if err != nil {
		log.Printf("store: %v", err)
		return
	}
	prices, err := api.prices(ctx, missing, country)
	if err != nil {
		log.Printf("store prices: %v", err)
	}
	var tags map[int]string
	if needTags {
		if tags, err = api.tagNames(ctx); err != nil {
			log.Printf("store tags: %v", err)
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	for _, id := range missing {
		l.store[id] = items[id] // zero for an app the store doesn't have
	}
	maps.Copy(l.prices, prices)
	if tags != nil {
		l.tags = tags
	}
}

func (l *Library) gamesLocked(local map[string]localApp) []Game {
	owned := map[string]ownedGame{}
	for _, o := range l.owned {
		owned[strconv.Itoa(o.AppID)] = o
	}
	ids := slices.Collect(maps.Keys(local))
	for id := range owned {
		if _, ok := local[id]; !ok {
			ids = append(ids, id)
		}
	}

	games := []Game{}
	for _, id := range ids {
		n, _ := strconv.Atoi(id)
		app, o := local[id], owned[id]
		it, asked := l.store[n]
		switch {
		case it.AppID != 0 && !it.launchable():
			continue // a soundtrack, say
		case asked && it.AppID == 0 && o.AppID == 0 && app.Minutes == 0:
			continue // a tool such as Steamworks Common Redistributables
		}
		g := Game{
			ID:           id,
			Title:        cmp.Or(o.Name, it.Name, app.Name),
			Art:          artFor(id, nil),
			Installed:    app.Installed,
			SizeGB:       roundTenth(float64(app.Size) / 1e9),
			Hours:        roundTenth(float64(max(o.Minutes, app.Minutes)) / 60),
			RecentHours:  roundTenth(float64(max(o.Minutes2Wks, app.Minutes2Wks)) / 60),
			LastPlayed:   latest(app.LastPlayed, unixTime(o.LastPlayed), l.state.LastPlayed[id]),
			Achievements: []Achievement{},
			News:         []News{},
			hasStats:     o.HasStats,
		}
		if g.Title == "" {
			continue // played here once, and unknown to the store
		}
		if it.AppID != 0 {
			g.fromStore(l.api, it, l.tags)
		}
		if p, ok := l.prices[n]; ok {
			g.Price = p
		}
		if d, ok := l.details[id]; ok {
			d.apply(&g)
		}
		games = append(games, g)
	}
	slices.SortFunc(games, func(a, b Game) int {
		return cmp.Or(b.LastPlayed.Compare(a.LastPlayed), cmp.Compare(a.Title, b.Title), cmp.Compare(a.ID, b.ID))
	})
	return games
}

// fromStore fills in what the store page of the game tells.
func (g *Game) fromStore(api *steamAPI, it storeItem, tags map[int]string) {
	var genre []string
	for _, t := range it.Tags {
		if name := tags[t.TagID]; name != "" && len(genre) < 2 {
			genre = append(genre, name)
		}
	}
	g.Genre = strings.Join(genre, " · ")
	g.Blurb = strings.TrimSpace(it.BasicInfo.Description)
	if len(it.BasicInfo.Developers) > 0 {
		g.Developer = it.BasicInfo.Developers[0].Name
	}
	if len(it.BasicInfo.Publishers) > 0 {
		g.Publisher = it.BasicInfo.Publishers[0].Name
	}
	if it.Release.Date > 0 {
		g.Released = time.Unix(it.Release.Date, 0).UTC().Format(time.DateOnly)
	}
	g.Cover = api.asset(it, it.Assets.Capsule)
	g.Hero = api.asset(it, it.Assets.Hero)
	g.header = api.asset(it, it.Assets.Header)
	// Store categories: 28 is full controller support, 18 partial, 23
	// Steam Cloud.
	g.Controller = slices.Contains(it.Categories.Controller, 28) || slices.Contains(it.Categories.Controller, 18)
	g.CloudSaves = slices.Contains(it.Categories.Feature, 23)
	if it.IsFree {
		g.Price = Price{Now: "Free"}
	}
}

// Details returns the game with the given ID with the colors of its art,
// its news, and its achievements when an account is connected.
func (l *Library) Details(ctx context.Context, id string) (Game, error) {
	l.mu.Lock()
	i := l.indexLocked(id)
	if i < 0 {
		l.mu.Unlock()
		return Game{}, fmt.Errorf("no game %q", id)
	}
	g, api, steamID := l.games[i], l.api, l.state.SteamID
	l.mu.Unlock()
	if g.Detailed {
		return g, nil
	}

	appID, _ := strconv.Atoi(id)
	var (
		wg                      sync.WaitGroup
		achievements            []steamAchievement
		news                    []steamNews
		img                     image.Image
		achievementErr, newsErr error
	)
	if api.key != "" && g.hasStats {
		wg.Go(func() { achievements, achievementErr = api.achievements(ctx, steamID, appID) })
	}
	wg.Go(func() { news, newsErr = api.news(ctx, appID, 4) })
	if g.header != "" {
		// Without the picture, the art keeps the colors it has.
		wg.Go(func() { img, _ = api.image(ctx, g.header) })
	}
	wg.Wait()
	if err := cmp.Or(achievementErr, newsErr); err != nil {
		return Game{}, err
	}

	d := details{art: artFor(id, img), achievementsTotal: len(achievements), news: make([]News, len(news))}
	d.achievementsUnlocked, d.achievements = shownAchievements(achievements)
	for i, n := range news {
		d.news[i] = News{
			Tag:   strings.Replace(n.FeedLabel, "Community Announcements", "Announcement", 1),
			Title: n.Title,
			When:  time.Unix(n.Date, 0),
			URL:   n.URL,
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	if l.api == api {
		l.details[id] = d
		if i := l.indexLocked(id); i >= 0 {
			g = l.games[i] // with what changed meanwhile
			d.apply(&l.games[i])
		}
	}
	d.apply(&g)
	return g, nil
}

// shownAchievements returns how many achievements are unlocked, and the
// three a hub shows: the latest unlocked and the next to unlock.
func shownAchievements(all []steamAchievement) (int, []Achievement) {
	var unlocked, locked []Achievement
	for _, a := range all {
		shown := Achievement{Title: a.Name, Detail: a.Description, Unlocked: a.Achieved == 1}
		if shown.Unlocked {
			shown.UnlockedAt = time.Unix(a.UnlockTime, 0)
			unlocked = append(unlocked, shown)
		} else {
			locked = append(locked, shown)
		}
	}
	slices.SortStableFunc(unlocked, func(a, b Achievement) int { return b.UnlockedAt.Compare(a.UnlockedAt) })
	n := min(len(unlocked), 3-min(len(locked), 1))
	shown := append(unlocked[:n:n], locked[:min(len(locked), 3-n)]...)
	if shown == nil {
		shown = []Achievement{}
	}
	return len(unlocked), shown
}

func roundTenth(f float64) float64 { return math.Round(f*10) / 10 }

func latest(times ...time.Time) time.Time {
	var t time.Time
	for _, u := range times {
		if u.After(t) {
			t = u
		}
	}
	return t
}

// Selected returns the ID of the game selected on the home screen, "" if
// none was.
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

// Shortcuts returns the keys of the keyboard commands the user changed, by
// command; the page knows the keys of the others.
func (l *Library) Shortcuts() map[string][]string {
	l.mu.Lock()
	defer l.mu.Unlock()
	shortcuts := map[string][]string{}
	for command, keys := range l.state.Shortcuts {
		shortcuts[command] = slices.Clone(keys)
	}
	return shortcuts
}

// SetShortcuts keeps the keys of the keyboard commands the user changed, by
// command. An empty list is a command without keys.
func (l *Library) SetShortcuts(shortcuts map[string][]string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.state.Shortcuts = map[string][]string{}
	for command, keys := range shortcuts {
		if keys == nil {
			keys = []string{}
		}
		l.state.Shortcuts[command] = slices.Clone(keys)
	}
	return l.saveLocked()
}

// StartFullScreen tells whether the app opens in full screen.
func (l *Library) StartFullScreen() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state.StartFullScreen
}

// SetStartFullScreen makes the app open in full screen, or in a window.
func (l *Library) SetStartFullScreen(on bool) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.state.StartFullScreen = on
	return l.saveLocked()
}

// Install asks the Steam client to install the game with the given ID.
func (l *Library) Install(id string) (Game, error) {
	l.mu.Lock()
	i := l.indexLocked(id)
	if i < 0 {
		l.mu.Unlock()
		return Game{}, fmt.Errorf("no game %q", id)
	}
	g := l.games[i]
	l.mu.Unlock()
	if err := l.launch("steam://install/" + id); err != nil {
		return Game{}, fmt.Errorf("can't open Steam: %w", err)
	}
	return g, nil
}

// Play launches the game with the given ID in the Steam client and returns
// the game with its last session updated.
func (l *Library) Play(id string) (Game, error) {
	local, err := l.client.apps("")
	if err != nil {
		return Game{}, fmt.Errorf("Steam client: %w", err)
	}
	l.mu.Lock()
	i := l.indexLocked(id)
	if i < 0 {
		l.mu.Unlock()
		return Game{}, fmt.Errorf("no game %q", id)
	}
	title := l.games[i].Title
	l.mu.Unlock()
	if !local[id].Installed {
		return Game{}, fmt.Errorf("%s is not installed", title)
	}
	if err := l.launch("steam://rungameid/" + id); err != nil {
		return Game{}, fmt.Errorf("can't open Steam: %w", err)
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.state.LastPlayed[id] = now
	i = l.indexLocked(id)
	if i < 0 {
		return Game{}, fmt.Errorf("no game %q", id)
	}
	l.games[i].LastPlayed = now
	l.games[i].Installed = true
	return l.games[i], l.saveLocked()
}

// Store shows the Steam store in a window of the app, and other pages of
// Steam, such as news, in the default browser.
type Store struct {
	launch func(url string) error // opens steam:// URLs

	mu  sync.Mutex
	win *mygo.Window // the store window; nil until first shown
}

// Open shows the Steam store.
func (s *Store) Open() error {
	return s.show("https://store.steampowered.com/")
}

// OpenGame shows the store page of the game with the given ID.
func (s *Store) OpenGame(id string) error {
	if _, err := strconv.Atoi(id); err != nil {
		return fmt.Errorf("no game %q", id)
	}
	return s.show("https://store.steampowered.com/app/" + id)
}

// show loads a store page in the store window, opening the window if it
// isn't open.
func (s *Store) show(page string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.win != nil && !s.win.IsDestroyed() {
		if err := s.win.Page().LoadURL(page); err != nil {
			return err
		}
		if s.win.IsMinimized() {
			s.win.Restore()
		}
		s.win.Focus()
		return nil
	}
	s.win = mygo.NewWindow(mygo.WindowOptions{
		Title:           "Steam Store",
		URL:             page,
		Width:           1280,
		Height:          860,
		MinWidth:        800,
		MinHeight:       600,
		BackgroundColor: "#1B2838", // the store's background
		StateKey:        "store",
	})
	// The store's buttons that install or play a game are steam:// links,
	// for the Steam client.
	s.win.Page().OnWillNavigate(func(e *mygo.NavigateEvent) {
		if u, err := url.Parse(e.URL); err == nil && u.Scheme == "steam" {
			e.PreventDefault()
			go func() {
				if err := s.launch(e.URL); err != nil {
					log.Printf("store: %v", err)
				}
			}()
		}
	})
	return nil
}

// OpenLink shows a web page, such as a news item.
func (*Store) OpenLink(link string) error {
	if u, err := url.Parse(link); err != nil || u.Scheme != "https" {
		return fmt.Errorf("%q is not a web page", link)
	}
	return mygo.Shell.OpenExternal(link)
}
