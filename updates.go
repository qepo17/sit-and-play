package main

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

// The app looks for a new version a little after it starts, then once a
// day while it runs.
const (
	updateDelay    = 10 * time.Second
	updateInterval = 24 * time.Hour
)

// UpdateStatus is how far the app got in updating itself.
type UpdateStatus struct {
	// State is "unsupported" for copies that can't update themselves, such
	// as the Debian package and development builds; else "idle",
	// "checking", "upToDate", "downloading", "ready" once the new version is
	// installed, which runs from the next launch, or "failed".
	State string `json:"state"`
	// Current is the version running, Version the new one, if any.
	Current string `json:"current"`
	Version string `json:"version,omitempty"`
	// Notes are the new version's section of CHANGELOG.md, in Markdown.
	Notes string `json:"notes,omitempty"`
	// Progress is how much of the new version is downloaded, from 0 to 1.
	Progress float64 `json:"progress"`
}

// UpdateChanged tells the page how far updating got.
var UpdateChanged = mygo.NewEvent[UpdateStatus]("update")

// Updates installs the new versions of the app published on GitHub
// Releases, in the background. The page restarts the app into them.
type Updates struct {
	mu     sync.Mutex
	status UpdateStatus
}

// start looks for new versions while the app runs.
func (u *Updates) start() {
	state := "idle"
	if !mygo.Updater.Enabled() {
		state = "unsupported"
	}
	u.set(func(s *UpdateStatus) {
		s.State = state
		s.Current = mygo.App.Version()
	})
	if state == "unsupported" {
		return
	}
	go func() {
		time.Sleep(updateDelay)
		for {
			u.update()
			time.Sleep(updateInterval)
		}
	}()
}

// Status returns how far updating got.
func (u *Updates) Status() UpdateStatus {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.status
}

// Check looks for a new version now and installs it. UpdateChanged tells
// how it goes.
func (u *Updates) Check() {
	go u.update()
}

// Restart quits the app and starts the new version, once it is installed.
func (u *Updates) Restart() error {
	if u.Status().State != "ready" {
		return errors.New("no new version is installed")
	}
	mygo.App.Relaunch()
	return nil
}

// update looks for a new version and installs it, unless it is doing so
// already, or did.
func (u *Updates) update() {
	busy := false
	u.set(func(s *UpdateStatus) {
		switch s.State {
		case "unsupported", "checking", "downloading", "ready":
			busy = true
		default:
			*s = UpdateStatus{State: "checking", Current: s.Current}
		}
	})
	if busy {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	up, err := mygo.Updater.Check(ctx)
	if err != nil {
		log.Printf("updates: %v", err)
		u.set(func(s *UpdateStatus) { s.State = "failed" })
		return
	}
	if up == nil {
		u.set(func(s *UpdateStatus) { s.State = "upToDate" })
		return
	}
	u.set(func(s *UpdateStatus) {
		s.State = "downloading"
		s.Version = up.Version
		s.Notes = up.Notes
	})
	err = up.Install(ctx, func(downloaded, total int64) {
		u.set(func(s *UpdateStatus) { s.Progress = float64(downloaded) / float64(max(total, 1)) })
	})
	if err != nil {
		log.Printf("updates: %v", err)
		u.set(func(s *UpdateStatus) { s.State = "failed" })
		return
	}
	u.set(func(s *UpdateStatus) { s.State = "ready" })
}

// set changes the status and tells the page, in the order of the changes.
func (u *Updates) set(change func(*UpdateStatus)) {
	u.mu.Lock()
	defer u.mu.Unlock()
	change(&u.status)
	UpdateChanged.Broadcast(u.status)
}
