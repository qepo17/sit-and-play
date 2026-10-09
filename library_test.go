package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

const (
	testSteamID   = "76561198000000001"
	testAccountID = "39734273" // testSteamID less the base of individual accounts
)

// fakeSteam is a Steam client directory and the Steam servers, with:
//
//	10  Hollow Tide  installed, played here
//	20  Ironvale     installed, never played
//	30  Saltmarsh    played here, not installed
//	40  Soundtrack   installed, not a game
//	50  Redist       installed, unknown to the store
//	60  Neon Drift   owned, only listed by the Web API
func fakeSteam(t *testing.T) (*Library, *[]string) {
	t.Helper()
	dir := t.TempDir()
	write := func(path, content string) {
		path = filepath.Join(dir, path)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("config/loginusers.vdf", `"users" { "`+testSteamID+`" { "PersonaName" "Qepo" "MostRecent" "1" } }`)
	write("steamapps/libraryfolders.vdf", fmt.Sprintf(`"libraryfolders" { "0" { "path" %q "apps" { "10" "1000" "20" "2000" "40" "10" "50" "10" } } }`, dir))
	write("steamapps/appmanifest_10.acf", `"AppState" { "name" "Hollow Tide" "StateFlags" "4" "SizeOnDisk" "38400000000" }`)
	write("steamapps/appmanifest_20.acf", `"AppState" { "name" "Ironvale" "StateFlags" "4" }`)
	write("steamapps/appmanifest_50.acf", `"AppState" { "name" "Redist" "StateFlags" "4" }`)
	write("userdata/"+testAccountID+"/config/localconfig.vdf", `"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" {
		"10" { "LastPlayed" "1700000000" "Playtime" "120" "Playtime2wks" "30" }
		"30" { "LastPlayed" "1600000000" "Playtime" "600" }
	} } } } }`)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		reply := func(v any) { json.NewEncoder(w).Encode(v) }
		switch strings.TrimSuffix(r.URL.Path, "/") {
		case "/IStoreBrowseService/GetItems/v1":
			names := map[string]string{"10": "Hollow Tide", "20": "Ironvale", "30": "Saltmarsh", "60": "Neon Drift"}
			var input struct{ IDs []struct{ AppID int } }
			json.Unmarshal([]byte(q.Get("input_json")), &input)
			var items []map[string]any
			for _, id := range input.IDs {
				key := fmt.Sprint(id.AppID)
				switch {
				case id.AppID == 40:
					items = append(items, map[string]any{"appid": 40, "name": "Soundtrack", "type": 11})
				case names[key] != "":
					items = append(items, map[string]any{
						"appid": id.AppID, "name": names[key], "type": 0,
						"tags":       []map[string]int{{"tagid": 1}, {"tagid": 2}},
						"categories": map[string][]int{"controller_categoryids": {28}, "feature_categoryids": {23}},
						"basic_info": map[string]any{"short_description": "About " + names[key], "developers": []map[string]string{{"name": "Studio"}}},
						"assets":     map[string]string{"asset_url_format": "steam/apps/" + key + "/${FILENAME}", "library_capsule": "c.jpg"},
					})
				}
			}
			reply(map[string]any{"response": map[string]any{"store_items": items}})
		case "/IStoreService/GetTagList/v1":
			reply(map[string]any{"response": map[string]any{"tags": []map[string]any{{"tagid": 1, "name": "Action"}, {"tagid": 2, "name": "Adventure"}}}})
		case "/api/appdetails":
			reply(map[string]any{
				"10": map[string]any{"success": true, "data": map[string]any{"price_overview": map[string]any{"final_formatted": "Rp 189 000", "initial_formatted": "Rp 315 000", "discount_percent": 40}}},
				"20": map[string]any{"success": true, "data": []any{}},
			})
		case "/ISteamNews/GetNewsForApp/v2":
			reply(map[string]any{"appnews": map[string]any{"newsitems": []map[string]any{{"title": "Patch 1.4", "url": "https://example.com/1", "feedlabel": "Community Announcements", "date": 1700000000}}}})
		case "/ISteamUser/ResolveVanityURL/v1":
			if q.Get("vanityurl") == "qepo" {
				reply(map[string]any{"response": map[string]any{"success": 1, "steamid": testSteamID}})
			} else {
				reply(map[string]any{"response": map[string]any{"success": 42}})
			}
		case "/ISteamUser/GetPlayerSummaries/v2", "/IPlayerService/GetOwnedGames/v1", "/ISteamUserStats/GetPlayerAchievements/v1":
			if q.Get("key") != "good-key" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			switch r.URL.Path[:strings.LastIndex(strings.TrimSuffix(r.URL.Path, "/"), "/")] {
			case "/ISteamUser/GetPlayerSummaries":
				reply(map[string]any{"response": map[string]any{"players": []map[string]any{{"steamid": testSteamID, "personaname": "Qepo", "loccountrycode": "ID"}}}})
			case "/IPlayerService/GetOwnedGames":
				reply(map[string]any{"response": map[string]any{"game_count": 2, "games": []map[string]any{
					{"appid": 10, "name": "Hollow Tide", "playtime_forever": 150, "has_community_visible_stats": true},
					{"appid": 60, "name": "Neon Drift", "playtime_forever": 0},
				}}})
			case "/ISteamUserStats/GetPlayerAchievements":
				reply(map[string]any{"playerstats": map[string]any{"success": true, "achievements": []map[string]any{
					{"name": "First", "achieved": 1, "unlocktime": 1600000000},
					{"name": "Latest", "achieved": 1, "unlocktime": 1700000000},
					{"name": "Middle", "achieved": 1, "unlocktime": 1650000000},
					{"name": "Next", "description": "Find all shells", "achieved": 0},
				}}})
			}
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	var launched []string
	l := newLibrary()
	l.client = steamClient{dir}
	l.newAPI = func(key string) *steamAPI {
		api := newSteamAPI(key)
		api.base, api.store, api.assets = server.URL, server.URL, server.URL+"/assets/"
		return api
	}
	l.api = l.newAPI("")
	l.launch = func(u string) error {
		launched = append(launched, u)
		return nil
	}
	return l, &launched
}

func gameByID(t *testing.T, games []Game, id string) Game {
	t.Helper()
	i := slices.IndexFunc(games, func(g Game) bool { return g.ID == id })
	if i < 0 {
		t.Fatalf("no game %s in %v", id, games)
	}
	return games[i]
}

func ids(games []Game) []string {
	var ids []string
	for _, g := range games {
		ids = append(ids, g.ID)
	}
	return ids
}

func TestLibraryWithoutAccountShowsTheGamesOfThisComputer(t *testing.T) {
	l, launched := fakeSteam(t)
	ctx := context.Background()

	a, err := l.Account(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if a.Connected || !a.Client || a.SteamID != testSteamID || a.Name != "Qepo" {
		t.Errorf("Account() = %+v", a)
	}

	games, err := l.Games(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// The most recently played first; no soundtrack, no redistributable.
	if got, want := ids(games), []string{"10", "30", "20"}; !slices.Equal(got, want) {
		t.Fatalf("games = %v, want %v", got, want)
	}
	hollow := gameByID(t, games, "10")
	if !hollow.Installed || hollow.SizeGB != 38.4 || hollow.Hours != 2 || hollow.RecentHours != 0.5 {
		t.Errorf("Hollow Tide = installed %v, %v GB, %v h, %v h recently", hollow.Installed, hollow.SizeGB, hollow.Hours, hollow.RecentHours)
	}
	if hollow.Genre != "Action · Adventure" || hollow.Blurb != "About Hollow Tide" || !hollow.Controller || !hollow.CloudSaves {
		t.Errorf("Hollow Tide store page = %+v", hollow)
	}
	if want := (Price{Now: "Rp 189 000", Before: "Rp 315 000", Discount: 40}); hollow.Price != want {
		t.Errorf("Hollow Tide price = %+v, want %+v", hollow.Price, want)
	}
	if !strings.HasSuffix(hollow.Cover, "/assets/steam/apps/10/c.jpg") {
		t.Errorf("Hollow Tide cover = %q", hollow.Cover)
	}
	if salt := gameByID(t, games, "30"); salt.Installed || salt.Hours != 10 || salt.Title != "Saltmarsh" {
		t.Errorf("Saltmarsh = %+v", salt)
	}

	d, err := l.Details(ctx, "10")
	if err != nil {
		t.Fatal(err)
	}
	if !d.Detailed || len(d.News) != 1 || d.News[0].Tag != "Announcement" || d.AchievementsTotal != 0 {
		t.Errorf("Details without an account = %+v", d)
	}

	if _, err := l.Play("30"); err == nil {
		t.Error("Play of a game that is not installed succeeded")
	}
	played, err := l.Play("20")
	if err != nil {
		t.Fatal(err)
	}
	if err := l.SetShortcuts(map[string][]string{"quit": {"Ctrl+W"}, "store": nil}); err != nil {
		t.Fatal(err)
	}
	if time.Since(played.LastPlayed) > time.Minute {
		t.Errorf("Play did not update the last session: %v", played.LastPlayed)
	}
	if _, err := l.Install("30"); err != nil {
		t.Fatal(err)
	}
	if want := []string{"steam://rungameid/20", "steam://install/30"}; !slices.Equal(*launched, want) {
		t.Errorf("launched %v, want %v", *launched, want)
	}
}

func TestLibraryKeepsStateBetweenLaunches(t *testing.T) {
	l, _ := fakeSteam(t)
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "library.json")
	if err := l.load(path); err != nil {
		t.Fatal(err)
	}
	if _, err := l.Games(ctx); err != nil {
		t.Fatal(err)
	}
	if err := l.Select("30"); err != nil {
		t.Fatal(err)
	}
	if err := l.Select("nope"); err == nil {
		t.Error("Select of an unknown game succeeded")
	}
	played, err := l.Play("20")
	if err != nil {
		t.Fatal(err)
	}
	if err := l.SetShortcuts(map[string][]string{"quit": {"Ctrl+W"}, "store": nil}); err != nil {
		t.Fatal(err)
	}

	again, _ := fakeSteam(t)
	again.client = l.client
	if err := again.load(path); err != nil {
		t.Fatal(err)
	}
	if got := again.Selected(); got != "30" {
		t.Errorf("Selected() = %q, want 30", got)
	}
	// A command without keys stays without keys, rather than taking its default keys.
	if got, want := again.Shortcuts(), map[string][]string{"quit": {"Ctrl+W"}, "store": {}}; !reflect.DeepEqual(got, want) {
		t.Errorf("Shortcuts() = %v, want %v", got, want)
	}
	games, err := again.Games(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Played from the app just now, so first.
	if games[0].ID != "20" || !games[0].LastPlayed.Equal(played.LastPlayed) {
		t.Errorf("first game = %s last played %v, want 20 at %v", games[0].ID, games[0].LastPlayed, played.LastPlayed)
	}
}

func TestConnectAddsOwnedGamesAndAchievements(t *testing.T) {
	l, _ := fakeSteam(t)
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "library.json")
	if err := l.load(path); err != nil {
		t.Fatal(err)
	}

	if _, err := l.Connect(ctx, "bad-key", "qepo"); err == nil || !strings.Contains(err.Error(), "rejected") {
		t.Errorf("Connect with a bad key: %v", err)
	}
	if _, err := l.Connect(ctx, "good-key", "nobody"); err == nil {
		t.Error("Connect of an unknown profile succeeded")
	}
	a, err := l.Connect(ctx, "good-key", "https://steamcommunity.com/id/qepo/")
	if err != nil {
		t.Fatal(err)
	}
	if !a.Connected || a.SteamID != testSteamID {
		t.Errorf("Connect() = %+v", a)
	}

	games, err := l.Games(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := ids(games), []string{"10", "30", "20", "60"}; !slices.Equal(got, want) {
		t.Fatalf("games = %v, want %v", got, want)
	}
	if h := gameByID(t, games, "10").Hours; h != 2.5 {
		t.Errorf("Hollow Tide hours = %v, want the Web API's 2.5", h)
	}
	d, err := l.Details(ctx, "10")
	if err != nil {
		t.Fatal(err)
	}
	var shown []string
	for _, a := range d.Achievements {
		shown = append(shown, a.Title)
	}
	if d.AchievementsUnlocked != 3 || d.AchievementsTotal != 4 || !slices.Equal(shown, []string{"Latest", "Middle", "Next"}) {
		t.Errorf("achievements = %d of %d, shown %v", d.AchievementsUnlocked, d.AchievementsTotal, shown)
	}

	// Connected at the next launch too, until disconnected.
	again, _ := fakeSteam(t)
	again.newAPI = l.newAPI
	if err := again.load(path); err != nil {
		t.Fatal(err)
	}
	if a, err := again.Account(ctx); err != nil || !a.Connected {
		t.Errorf("Account() after a relaunch = %+v, %v", a, err)
	}
	if err := again.Disconnect(); err != nil {
		t.Fatal(err)
	}
	if a, _ := again.Account(ctx); a.Connected {
		t.Error("still connected after Disconnect")
	}
	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "good-key") {
		t.Error("the key is still saved after Disconnect")
	}
}

func TestParseVDF(t *testing.T) {
	v, err := parseVDF(`// a comment
"root"
{
	"path"		"C:\\Games\\Steam"
	"quote"		"say \"hi\""
	"empty"		{ }
}`)
	if err != nil {
		t.Fatal(err)
	}
	root := v.section("ROOT") // keys match regardless of case
	if got := root.str("path"); got != `C:\Games\Steam` {
		t.Errorf("path = %q", got)
	}
	if got := root.str("quote"); got != `say "hi"` {
		t.Errorf("quote = %q", got)
	}
	if root.section("empty") == nil {
		t.Error("empty section is missing")
	}
	for _, bad := range []string{`"a" {`, `"a"`, `"a" "b" }`, `"a`} {
		if _, err := parseVDF(bad); err == nil {
			t.Errorf("parseVDF(%q) succeeded", bad)
		}
	}
}
