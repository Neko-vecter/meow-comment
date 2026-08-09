package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"moew-comment/backend/internal/admin"
	"moew-comment/backend/internal/adminclient"
	"moew-comment/backend/internal/config"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		printUsage()
		return errors.New("a command is required")
	}

	switch args[0] {
	case "token":
		return runToken(args[1:])
	case "config":
		return runConfig(args[1:])
	case "admin-key":
		return runAdminKey(args[1:])
	case "help", "-h", "--help":
		printUsage()
		return nil
	default:
		printUsage()
		return fmt.Errorf("unknown command: %s", args[0])
	}
}

func runToken(args []string) error {
	if len(args) == 0 {
		return errors.New("token command is required: create or delete")
	}
	switch args[0] {
	case "create":
		return runTokenCreate(args[1:])
	case "delete":
		return runTokenDelete(args[1:])
	default:
		return fmt.Errorf("unknown token command: %s", args[0])
	}
}

func runTokenCreate(args []string) error {
	flags := newFlagSet("token create")
	configPath := flags.String("config", "config.json", "path to JSON config")
	keyPath := flags.String("key-file", "", "override admin key file path")
	adminListen := flags.String("admin-listen", "", "override admin listen address")
	name := flags.String("name", "", "token key name")
	if err := flags.Parse(args); err != nil {
		return err
	}

	keyName := strings.TrimSpace(*name)
	if keyName == "" {
		reader := bufio.NewReader(os.Stdin)
		fmt.Fprint(os.Stdout, "key name: ")
		value, err := reader.ReadString('\n')
		if err != nil && len(value) == 0 {
			return fmt.Errorf("read key name: %w", err)
		}
		keyName = strings.TrimSpace(value)
	}
	if keyName == "" {
		return errors.New("key name is required")
	}

	client, err := loadClient(*configPath, *keyPath, *adminListen)
	if err != nil {
		return err
	}
	created, err := client.CreateToken(context.Background(), keyName)
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stdout, "name: %s\n", created.Name)
	fmt.Fprintf(os.Stdout, "id: %s\n", created.ID)
	fmt.Fprintf(os.Stdout, "token: %s\n", created.Token)
	return nil
}

func runTokenDelete(args []string) error {
	flags := newFlagSet("token delete")
	configPath := flags.String("config", "config.json", "path to JSON config")
	keyPath := flags.String("key-file", "", "override admin key file path")
	adminListen := flags.String("admin-listen", "", "override admin listen address")
	name := flags.String("name", "", "token key name")
	tokenID := flags.String("id", "", "token id")
	if err := flags.Parse(args); err != nil {
		return err
	}

	trimmedName := strings.TrimSpace(*name)
	trimmedID := strings.TrimSpace(*tokenID)
	if (trimmedName == "") == (trimmedID == "") {
		return errors.New("exactly one of --name or --id is required")
	}

	client, err := loadClient(*configPath, *keyPath, *adminListen)
	if err != nil {
		return err
	}
	if err := client.DeleteToken(context.Background(), trimmedName, trimmedID); err != nil {
		return err
	}
	fmt.Fprintln(os.Stdout, "token deleted")
	return nil
}

func loadClient(configPath, keyPath, adminListen string) (*adminclient.Client, error) {
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(adminListen) == "" {
		adminListen = cfg.AdminListen
	}
	if strings.TrimSpace(keyPath) == "" {
		keyPath = cfg.AdminKeyFile
	}
	key, err := admin.LoadKey(keyPath)
	if err != nil {
		return nil, err
	}
	return adminclient.New(adminListen, key)
}

func runConfig(args []string) error {
	if len(args) == 0 || args[0] != "migrate" {
		return errors.New("config command is required: migrate")
	}
	flags := newFlagSet("config migrate")
	configPath := flags.String("config", "config.json", "path to JSON config")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	changed, err := config.MigrateFile(*configPath)
	if err != nil {
		return err
	}
	if changed {
		fmt.Fprintf(os.Stdout, "migrated config: %s\n", *configPath)
	} else {
		fmt.Fprintf(os.Stdout, "config already current: %s\n", *configPath)
	}
	return nil
}

func runAdminKey(args []string) error {
	if len(args) == 0 {
		return errors.New("admin-key command is required: generate or ensure")
	}
	switch args[0] {
	case "generate":
		if len(args) != 1 {
			return errors.New("admin-key generate does not accept arguments")
		}
		key, err := admin.GenerateKey()
		if err != nil {
			return err
		}
		fmt.Fprintln(os.Stdout, key)
		return nil
	case "ensure":
		return runAdminKeyEnsure(args[1:])
	default:
		return fmt.Errorf("unknown admin-key command: %s", args[0])
	}
}

func runAdminKeyEnsure(args []string) error {
	flags := newFlagSet("admin-key ensure")
	configPath := flags.String("config", "config.json", "path to JSON config")
	keyPath := flags.String("key-file", "", "override admin key file path")
	if err := flags.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	path := strings.TrimSpace(*keyPath)
	if path == "" {
		path = cfg.AdminKeyFile
	}
	if _, err := admin.LoadOrCreateKey(path); err != nil {
		return err
	}
	fmt.Fprintln(os.Stdout, path)
	return nil
}

func newFlagSet(name string) *flag.FlagSet {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	return flags
}

func printUsage() {
	fmt.Fprintln(os.Stderr, "Usage:")
	fmt.Fprintln(os.Stderr, "  meow-commentctl token create --config config.json [--name blog]")
	fmt.Fprintln(os.Stderr, "  meow-commentctl token delete --config config.json --name blog")
	fmt.Fprintln(os.Stderr, "  meow-commentctl token delete --config config.json --id TOKEN_ID")
	fmt.Fprintln(os.Stderr, "  meow-commentctl config migrate --config config.json")
	fmt.Fprintln(os.Stderr, "  meow-commentctl admin-key generate")
	fmt.Fprintln(os.Stderr, "  meow-commentctl admin-key ensure --config config.json")
}
