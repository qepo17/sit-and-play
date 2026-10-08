package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestLibraryKeepsStateBetweenLaunches(t *testing.T) {
	path := filepath.Join(t.TempDir(), "library.json")

	l := newLibrary()
	if err := l.load(path); err != nil {
		t.Fatal(err)
	}
	if err := l.Select("neon"); err != nil {
		t.Fatal(err)
	}
	if _, err := l.Install("salt"); err != nil {
		t.Fatal(err)
	}
	played, err := l.Play("salt")
	if err != nil {
		t.Fatal(err)
	}
	if time.Since(played.LastPlayed) > time.Minute {
		t.Fatalf("Play did not update the last session: %v", played.LastPlayed)
	}

	again := newLibrary()
	if err := again.load(path); err != nil {
		t.Fatal(err)
	}
	if got := again.Selected(); got != "neon" {
		t.Errorf("Selected() = %q, want neon", got)
	}
	for _, g := range again.Games() {
		if g.ID == "salt" {
			if !g.Installed {
				t.Error("Saltmarsh is not installed after a relaunch")
			}
			if !g.LastPlayed.Equal(played.LastPlayed) {
				t.Errorf("LastPlayed = %v, want %v", g.LastPlayed, played.LastPlayed)
			}
		}
	}
}

func TestLibraryRejectsUnknownAndUninstalledGames(t *testing.T) {
	l := newLibrary()
	if err := l.Select("nope"); err == nil {
		t.Error("Select of an unknown game succeeded")
	}
	if _, err := l.Play("paper"); err == nil {
		t.Error("Play of a game that is not installed succeeded")
	}
}
