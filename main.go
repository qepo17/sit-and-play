package main

import (
	"log"
	"path/filepath"

	"github.com/egoist/mygo"
)

func main() {
	library := newLibrary()
	mygo.Bind(library)
	mygo.Bind(&Store{launch: library.launch})
	mygo.Bind(&App{})

	mygo.App.WhenReady(func() {
		dir, err := mygo.App.Path(mygo.PathUserData)
		if err == nil {
			err = library.load(filepath.Join(dir, "library.json"))
		}
		if err != nil {
			log.Printf("library state: %v", err)
		}

		mygo.NewWindow(mygo.WindowOptions{
			Title:           "Steam Library",
			Width:           1440,
			Height:          900,
			MinWidth:        960,
			MinHeight:       640,
			BackgroundColor: "#0B0E14", // the page's background in src/style.css
			// Opens where the user left it last time.
			StateKey: "main",
			// The frontend: devUrl during `mygo dev`, frontendDist
			// embedded by `mygo build` otherwise (see mygo.config.ts).
			URL: "/",
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

// App is the application, for the page.
type App struct{}

// Quit closes the app's windows, the store's included, and quits.
func (*App) Quit() {
	mygo.App.Quit()
}
