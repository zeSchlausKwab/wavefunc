package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/ui"
)

var (
	version = "dev"
	commit  = "local"
)

func main() {
	var (
		relayURL       string
		themeName      string
		skipOnboarding bool
		lucky          bool
		showVersion    bool
	)

	flag.StringVar(&relayURL, "relay", os.Getenv("WF_RELAY_URL"), "Override WaveFunc Nostr relay URL (default: wss://relay.wavefunc.live)")
	flag.StringVar(&themeName, "theme", "", "UI theme: dark (sonic-dark) or light (constructivist-paper)")
	flag.BoolVar(&skipOnboarding, "skip-onboarding", false, "Skip first-run onboarding wizard")
	flag.BoolVar(&lucky, "lucky", false, "Tune immediately into a random high-signal station")
	flag.BoolVar(&showVersion, "version", false, "Print wf version and exit")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `wf — WaveFunc Radio Terminal UI (%s)

Usage:
  wf [flags]                 Launch the interactive WaveFunc TUI
  wf play <query>            Search stations and tune into the top match immediately
  wf --lucky                 Jump straight into a live featured station

Flags:
`, version)
		flag.PrintDefaults()
	}
	flag.Parse()

	if showVersion {
		fmt.Printf("wf %s (%s)\n", version, commit)
		return
	}

	var playQuery string
	args := flag.Args()
	if len(args) > 0 {
		switch args[0] {
		case "play":
			if len(args) < 2 {
				fmt.Fprintln(os.Stderr, "Usage: wf play <query>")
				os.Exit(2)
			}
			playQuery = strings.Join(args[1:], " ")
		case "version":
			fmt.Printf("wf %s (%s)\n", version, commit)
			return
		case "help":
			flag.Usage()
			return
		default:
			// Allow shorthand `wf <query>`? Keep strict so typos show usage cleanly.
			fmt.Fprintf(os.Stderr, "Unknown command %q. Try `wf play %s` or `wf --help`.\n", args[0], strings.Join(args, " "))
			os.Exit(2)
		}
	}

	app := ui.NewApp(ui.LaunchOptions{
		RelayOverride:  relayURL,
		ThemeOverride:  themeName,
		SkipOnboarding: skipOnboarding,
		PlayQuery:      playQuery,
		Lucky:          lucky,
		Version:        version,
	})
	defer app.Cleanup()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		app.Cleanup()
		os.Exit(0)
	}()

	prog := tea.NewProgram(app, tea.WithAltScreen(), tea.WithMouseCellMotion())
	if _, err := prog.Run(); err != nil {
		app.Cleanup()
		fmt.Fprintf(os.Stderr, "wf error: %v\n", err)
		os.Exit(1)
	}
}
