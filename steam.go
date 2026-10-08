package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// steamAPI calls the Steam Web API (https://partner.steamgames.com/doc/webapi)
// and the store. Methods about an account need a user's Web API key; the
// store and the news don't.
type steamAPI struct {
	key    string // "" for none
	base   string // "https://api.steampowered.com"
	store  string // "https://store.steampowered.com"
	assets string // where store art is served, before its asset path
	client *http.Client
}

func newSteamAPI(key string) *steamAPI {
	return &steamAPI{
		key:    key,
		base:   "https://api.steampowered.com",
		store:  "https://store.steampowered.com",
		assets: "https://shared.akamai.steamstatic.com/store_item_assets/",
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

// statusError is a response of Steam other than 200 OK.
type statusError struct{ code int }

func (e statusError) Error() string {
	switch e.code {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "Steam rejected the Web API key"
	case http.StatusTooManyRequests:
		return "Steam is limiting requests, try again in a few minutes"
	}
	return fmt.Sprintf("Steam answered %d %s", e.code, http.StatusText(e.code))
}

// get calls a method, such as "IPlayerService/GetOwnedGames/v1", and
// decodes its JSON answer into out.
func (s *steamAPI) get(ctx context.Context, method string, params url.Values, out any) error {
	if s.key != "" {
		params.Set("key", s.key)
	}
	return s.getURL(ctx, s.base+"/"+method+"/?"+params.Encode(), out)
}

func (s *steamAPI) getURL(ctx context.Context, u string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	res, err := s.client.Do(req)
	if err != nil {
		// Not the url.Error, whose message has the URL and so the key.
		if ue := (*url.Error)(nil); errors.As(err, &ue) {
			err = ue.Err
		}
		return fmt.Errorf("can't reach Steam: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return statusError{res.StatusCode}
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("%s: %w", req.URL.Path, err)
	}
	return nil
}

type steamPlayer struct {
	SteamID     string `json:"steamid"`
	Name        string `json:"personaname"`
	Avatar      string `json:"avatarfull"`
	CountryCode string `json:"loccountrycode"`
}

// player returns the public profile of an account.
func (s *steamAPI) player(ctx context.Context, steamID string) (steamPlayer, error) {
	var r struct {
		Response struct {
			Players []steamPlayer `json:"players"`
		} `json:"response"`
	}
	err := s.get(ctx, "ISteamUser/GetPlayerSummaries/v2", url.Values{"steamids": {steamID}}, &r)
	if err != nil {
		return steamPlayer{}, err
	}
	if len(r.Response.Players) == 0 {
		return steamPlayer{}, fmt.Errorf("no Steam account %s", steamID)
	}
	return r.Response.Players[0], nil
}

// steamID returns the SteamID64 of an account given as a SteamID64, a
// profile URL or the custom name of a profile URL.
func (s *steamAPI) steamID(ctx context.Context, account string) (string, error) {
	account = strings.TrimSpace(account)
	if u, err := url.Parse(account); err == nil && u.Host != "" {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) != 2 || (parts[0] != "profiles" && parts[0] != "id") {
			return "", fmt.Errorf("%s is not a Steam profile URL", account)
		}
		account = parts[1]
	}
	if len(account) == 17 && strings.HasPrefix(account, "7656") {
		if _, err := strconv.ParseUint(account, 10, 64); err == nil {
			return account, nil
		}
	}
	if account == "" {
		return "", errors.New("enter your Steam account")
	}
	var r struct {
		Response struct {
			Success int    `json:"success"`
			SteamID string `json:"steamid"`
		} `json:"response"`
	}
	if err := s.get(ctx, "ISteamUser/ResolveVanityURL/v1", url.Values{"vanityurl": {account}}, &r); err != nil {
		return "", err
	}
	if r.Response.Success != 1 {
		return "", fmt.Errorf("no Steam profile is named %q", account)
	}
	return r.Response.SteamID, nil
}

type ownedGame struct {
	AppID       int    `json:"appid"`
	Name        string `json:"name"`
	Minutes     int    `json:"playtime_forever"`
	Minutes2Wks int    `json:"playtime_2weeks"`
	LastPlayed  int64  `json:"rtime_last_played"`
	HasStats    bool   `json:"has_community_visible_stats"`
}

// ownedGames returns the games of an account, including free games played.
func (s *steamAPI) ownedGames(ctx context.Context, steamID string) ([]ownedGame, error) {
	var r struct {
		Response struct {
			GameCount *int        `json:"game_count"`
			Games     []ownedGame `json:"games"`
		} `json:"response"`
	}
	err := s.get(ctx, "IPlayerService/GetOwnedGames/v1", url.Values{
		"steamid":                   {steamID},
		"include_appinfo":           {"1"},
		"include_played_free_games": {"1"},
	}, &r)
	if err != nil {
		return nil, err
	}
	if r.Response.GameCount == nil {
		// What Steam answers for a profile whose game details are private.
		return nil, errors.New("the game details of this Steam profile are private: set them to public in Steam's privacy settings")
	}
	return r.Response.Games, nil
}

// storeItem is what the store knows about an app.
type storeItem struct {
	AppID  int    `json:"appid"`
	Name   string `json:"name"`
	Type   int    `json:"type"`
	IsFree bool   `json:"is_free"`
	Tags   []struct {
		TagID int `json:"tagid"`
	} `json:"tags"`
	Categories struct {
		Feature    []int `json:"feature_categoryids"`
		Controller []int `json:"controller_categoryids"`
	} `json:"categories"`
	BasicInfo struct {
		Description string `json:"short_description"`
		Publishers  []struct {
			Name string `json:"name"`
		} `json:"publishers"`
		Developers []struct {
			Name string `json:"name"`
		} `json:"developers"`
	} `json:"basic_info"`
	Assets struct {
		Format  string `json:"asset_url_format"`
		Capsule string `json:"library_capsule"`
		Hero    string `json:"library_hero"`
		Header  string `json:"header"`
	} `json:"assets"`
	Release struct {
		Date int64 `json:"steam_release_date"`
	} `json:"release"`
}

// launchable tells whether the item is an app a library lists, rather than
// a soundtrack, a DLC or a tool. Its types are Steam's EStoreAppType.
func (it storeItem) launchable() bool {
	switch it.Type {
	case 0, 1, 2, 6, 12: // game, demo, mod, software, beta
		return true
	}
	return false
}

// asset returns the URL of one of the item's art files, or "".
func (s *steamAPI) asset(it storeItem, file string) string {
	if file == "" || it.Assets.Format == "" {
		return ""
	}
	return s.assets + strings.ReplaceAll(it.Assets.Format, "${FILENAME}", file)
}

// storeItems returns the store pages of apps. Apps the store doesn't have
// are left out.
func (s *steamAPI) storeItems(ctx context.Context, appIDs []int) (map[int]storeItem, error) {
	items := map[int]storeItem{}
	const batch = 100
	for start := 0; start < len(appIDs); start += batch {
		type id struct {
			AppID int `json:"appid"`
		}
		var ids []id
		for _, a := range appIDs[start:min(start+batch, len(appIDs))] {
			ids = append(ids, id{a})
		}
		input, err := json.Marshal(map[string]any{
			"ids": ids,
			// Prices aren't asked for, but the store needs a country.
			"context": map[string]string{"language": "english", "country_code": "US"},
			"data_request": map[string]any{
				"include_assets":     true,
				"include_basic_info": true,
				"include_release":    true,
				"include_tag_count":  4,
			},
		})
		if err != nil {
			return nil, err
		}
		var r struct {
			Response struct {
				Items []storeItem `json:"store_items"`
			} `json:"response"`
		}
		if err := s.get(ctx, "IStoreBrowseService/GetItems/v1", url.Values{"input_json": {string(input)}}, &r); err != nil {
			return nil, err
		}
		for _, it := range r.Response.Items {
			if it.AppID != 0 {
				items[it.AppID] = it
			}
		}
	}
	return items, nil
}

// prices returns the store prices of apps in a country, or where the
// computer is for "". Apps the store doesn't sell are left out.
func (s *steamAPI) prices(ctx context.Context, appIDs []int, country string) (map[int]Price, error) {
	prices := map[int]Price{}
	const batch = 100
	for start := 0; start < len(appIDs); start += batch {
		var ids []string
		for _, id := range appIDs[start:min(start+batch, len(appIDs))] {
			ids = append(ids, strconv.Itoa(id))
		}
		params := url.Values{"appids": {strings.Join(ids, ",")}, "filters": {"price_overview"}}
		if country != "" {
			params.Set("cc", country)
		}
		// Data is an empty array, not an object, for a free app.
		var r map[string]struct {
			Data json.RawMessage `json:"data"`
		}
		if err := s.getURL(ctx, s.store+"/api/appdetails?"+params.Encode(), &r); err != nil {
			return nil, err
		}
		for id, app := range r {
			var d struct {
				Price *struct {
					Final    string `json:"final_formatted"`
					Initial  string `json:"initial_formatted"`
					Discount int    `json:"discount_percent"`
				} `json:"price_overview"`
			}
			n, _ := strconv.Atoi(id)
			if json.Unmarshal(app.Data, &d) == nil && d.Price != nil && n != 0 {
				prices[n] = Price{Now: d.Price.Final, Before: d.Price.Initial, Discount: d.Price.Discount}
			}
		}
	}
	return prices, nil
}

// tagNames returns the names of the store's tags, by ID.
func (s *steamAPI) tagNames(ctx context.Context) (map[int]string, error) {
	var r struct {
		Response struct {
			Tags []struct {
				ID   int    `json:"tagid"`
				Name string `json:"name"`
			} `json:"tags"`
		} `json:"response"`
	}
	if err := s.get(ctx, "IStoreService/GetTagList/v1", url.Values{"language": {"english"}}, &r); err != nil {
		return nil, err
	}
	names := map[int]string{}
	for _, t := range r.Response.Tags {
		names[t.ID] = t.Name
	}
	return names, nil
}

type steamAchievement struct {
	Achieved    int    `json:"achieved"`
	UnlockTime  int64  `json:"unlocktime"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// achievements returns an account's achievements in a game, none for a
// game without them.
func (s *steamAPI) achievements(ctx context.Context, steamID string, appID int) ([]steamAchievement, error) {
	var r struct {
		Stats struct {
			Achievements []steamAchievement `json:"achievements"`
		} `json:"playerstats"`
	}
	err := s.get(ctx, "ISteamUserStats/GetPlayerAchievements/v1", url.Values{
		"steamid": {steamID},
		"appid":   {strconv.Itoa(appID)},
		"l":       {"english"},
	}, &r)
	// Steam answers 400 for a game without stats.
	if se := (statusError{}); errors.As(err, &se) && se.code == http.StatusBadRequest {
		return nil, nil
	}
	return r.Stats.Achievements, err
}

type steamNews struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	FeedLabel string `json:"feedlabel"`
	Date      int64  `json:"date"`
}

// news returns the latest announcements of a game.
func (s *steamAPI) news(ctx context.Context, appID, count int) ([]steamNews, error) {
	var r struct {
		News struct {
			Items []steamNews `json:"newsitems"`
		} `json:"appnews"`
	}
	err := s.get(ctx, "ISteamNews/GetNewsForApp/v2", url.Values{
		"appid":     {strconv.Itoa(appID)},
		"count":     {strconv.Itoa(count)},
		"maxlength": {"1"},
		// The developer's own; others may be in any language.
		"feeds": {"steam_community_announcements"},
	}, &r)
	return r.News.Items, err
}
